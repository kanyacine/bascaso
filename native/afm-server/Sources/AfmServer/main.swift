import Foundation
import FlyingFox
#if canImport(FoundationModels)
import FoundationModels
#endif

// MARK: - Wire types

/// Availability handshake, emitted by `--check` and `GET /health`.
/// Encodes `reason` as explicit JSON `null` when absent so the wire shape is
/// always `{"available":bool,"reason":<string|null>}` (the key is never
/// dropped, which Swift's default optional encoding would otherwise do).
struct Availability: Codable {
    let available: Bool
    let reason: String?

    enum CodingKeys: String, CodingKey {
        case available, reason
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(available, forKey: .available)
        if let reason {
            try container.encode(reason, forKey: .reason)
        } else {
            try container.encodeNil(forKey: .reason)
        }
    }
}

/// OpenAI chat-completion wire types (only the fields our AI SDK client
/// sends/reads). No streaming anywhere.
struct ChatMessage: Codable {
    let role: String
    let content: String
}

struct ChatRequest: Codable {
    let model: String?
    let messages: [ChatMessage]
    let temperature: Double?
}

struct ChatChoice: Codable {
    let index: Int
    let message: ChatMessage
    let finish_reason: String
}

struct ChatUsage: Codable {
    let prompt_tokens: Int
    let completion_tokens: Int
    let total_tokens: Int
}

struct ChatResponse: Codable {
    let id: String
    let object: String
    let created: Int
    let model: String
    let choices: [ChatChoice]
    let usage: ChatUsage
}

struct ModelInfo: Codable {
    let id: String
    let object: String
}

struct ModelList: Codable {
    let data: [ModelInfo]
}

struct ErrorDetail: Codable {
    let message: String
    let type: String
}

struct ErrorBody: Codable {
    let error: ErrorDetail
}

// MARK: - Availability

/// Resolve the on-device model status into the fixed reason vocabulary the
/// TypeScript spine depends on: "os_too_old" | "device_not_eligible" |
/// "apple_intelligence_disabled" | "model_not_ready" | nil (available).
func checkAvailability() -> Availability {
    guard #available(macOS 26.0, *) else {
        return Availability(available: false, reason: "os_too_old")
    }
    #if canImport(FoundationModels)
    switch SystemLanguageModel.default.availability {
    case .available:
        return Availability(available: true, reason: nil)
    case .unavailable(let reason):
        switch reason {
        case .deviceNotEligible:
            return Availability(available: false, reason: "device_not_eligible")
        case .appleIntelligenceNotEnabled:
            return Availability(available: false, reason: "apple_intelligence_disabled")
        case .modelNotReady:
            return Availability(available: false, reason: "model_not_ready")
        @unknown default:
            // Stay inside the contract's reason vocabulary; "model_not_ready"
            // is the most benign (retryable) bucket for a future reason.
            return Availability(available: false, reason: "model_not_ready")
        }
    }
    #else
    return Availability(available: false, reason: "os_too_old")
    #endif
}

// MARK: - Response helpers

func jsonResponse<T: Encodable>(_ value: T, status: HTTPStatusCode = .ok) -> HTTPResponse {
    let body = (try? JSONEncoder().encode(value)) ?? Data()
    return HTTPResponse(
        statusCode: status,
        headers: [.contentType: "application/json"],
        body: body
    )
}

/// 400 with the shape the client treats as a normal AFM error.
func errorResponse(_ message: String) -> HTTPResponse {
    jsonResponse(
        ErrorBody(error: ErrorDetail(message: message, type: "afm_error")),
        status: .badRequest
    )
}

func makeChatResponse(_ text: String) -> ChatResponse {
    ChatResponse(
        id: "afm-\(UUID().uuidString)",
        object: "chat.completion",
        created: Int(Date().timeIntervalSince1970),
        model: "apple-fm",
        choices: [
            ChatChoice(
                index: 0,
                message: ChatMessage(role: "assistant", content: text),
                finish_reason: "stop"
            )
        ],
        usage: ChatUsage(prompt_tokens: 0, completion_tokens: 0, total_tokens: 0)
    )
}

// MARK: - FoundationModels bridge

#if canImport(FoundationModels)
@available(macOS 26.0, *)
func generateReply(for req: ChatRequest) async throws -> String {
    // System messages become the session instructions; everything else is
    // joined into the prompt.
    let system = req.messages
        .filter { $0.role == "system" }
        .map(\.content)
        .joined(separator: "\n")
    let user = req.messages
        .filter { $0.role != "system" }
        .map(\.content)
        .joined(separator: "\n")

    // permissiveContentTransformations relaxes the default safety guardrails,
    // which otherwise false-positive ("may contain unsafe content") on benign
    // material such as religious app metadata. Every task the app routes here is
    // a content transformation (translate / improve / rewrite) over the user's
    // own text, so the permissive profile is the right fit.
    let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
    let session = system.isEmpty
        ? LanguageModelSession(model: model)
        : LanguageModelSession(model: model, instructions: system)

    let options = req.temperature.map { GenerationOptions(temperature: $0) }
        ?? GenerationOptions()

    let response = try await session.respond(to: user, options: options)
    return response.content
}
#endif

// MARK: - Entry point

let arguments = CommandLine.arguments

if arguments.contains("--check") {
    let data = try JSONEncoder().encode(checkAvailability())
    if let line = String(data: data, encoding: .utf8) {
        print(line)
    }
    exit(0)
}

// Any other invocation (including `--serve`) serves.
guard checkAvailability().available else {
    FileHandle.standardError.write(Data("model unavailable\n".utf8))
    exit(1)
}

// Bind the first free port in our fixed range so the app never has to parse a
// kernel-assigned one. FlyingFox's `run()` blocks; `waitUntilListening()`
// throws a SocketError when the bind fails (e.g. EADDRINUSE), which is our
// port-in-use probe.
let ports: [UInt16] = Array(43110...43119)
var server: HTTPServer?
var serverTask: Task<Void, Error>?
var boundPort: UInt16 = 0

for port in ports {
    let candidate = HTTPServer(port: port)
    let task = Task { try await candidate.run() }
    do {
        try await candidate.waitUntilListening()
        server = candidate
        serverTask = task
        boundPort = port
        break
    } catch {
        task.cancel()
        continue
    }
}

guard let server, let serverTask else {
    FileHandle.standardError.write(Data("no free port in 43110-43119\n".utf8))
    exit(1)
}

await server.appendRoute("GET /health") { _ in
    jsonResponse(checkAvailability())
}

await server.appendRoute("GET /v1/models") { _ in
    jsonResponse(ModelList(data: [ModelInfo(id: "apple-fm", object: "model")]))
}

await server.appendRoute("POST /v1/chat/completions") { request in
    let body: Data
    do {
        body = try await request.bodyData
    } catch {
        return errorResponse("\(error)")
    }
    do {
        let chat = try JSONDecoder().decode(ChatRequest.self, from: body)
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            // Any FoundationModels failure (incl. context-window overflow)
            // lands in the catch below → 400 afm_error.
            let text = try await generateReply(for: chat)
            return jsonResponse(makeChatResponse(text))
        }
        #endif
        return errorResponse("model unavailable")
    } catch {
        return errorResponse("\(error)")
    }
}

// Handshake: unbuffered write so Electron's line reader sees PORT immediately.
FileHandle.standardOutput.write(Data("PORT=\(boundPort)\n".utf8))

// Keep the process alive by awaiting the running server task.
do {
    try await serverTask.value
} catch {
    FileHandle.standardError.write(Data("server stopped: \(error)\n".utf8))
    exit(1)
}
