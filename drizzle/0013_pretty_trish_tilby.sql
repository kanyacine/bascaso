ALTER TABLE `ai_settings` ADD `tier` text DEFAULT 'byok' NOT NULL;
--> statement-breakpoint
UPDATE ai_settings SET tier = CASE WHEN provider = 'local-openai' THEN 'local' ELSE 'byok' END;
--> statement-breakpoint
INSERT OR IGNORE INTO app_preferences (key, value)
SELECT 'ai_routing_group_' || g.name,
       CASE WHEN (SELECT provider FROM ai_settings ORDER BY updated_at DESC LIMIT 1) = 'local-openai'
            THEN 'local' ELSE 'byok' END
FROM (SELECT 'redaction' AS name UNION ALL SELECT 'metadata' UNION ALL SELECT 'insights') g
WHERE EXISTS (SELECT 1 FROM ai_settings);