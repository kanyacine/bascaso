export async function uploadAsset(appId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.set("file", file);
  const res = await fetch(`/api/apps/${appId}/screenshot-doc/assets`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("upload failed");
  const { name } = await res.json();
  return name;
}
