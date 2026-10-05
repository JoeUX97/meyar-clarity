const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-nano";
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS || 1200);
const MAX_TEXT_LAYERS = Number(process.env.MAX_TEXT_LAYERS || 35);
const MAX_SAMPLE_NODES = Number(process.env.MAX_SAMPLE_NODES || 45);
const MAX_ACTION_NODES = Number(process.env.MAX_ACTION_NODES || 18);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function trimText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactLayer(layer, maxTextLength) {
  return {
    id: trimText(layer.id, 40),
    name: trimText(layer.name, 60),
    text: trimText(layer.characters, maxTextLength),
    type: trimText(layer.type, 24),
    w: layer.width || 0,
    h: layer.height || 0
  };
}

function compactSummary(summary) {
  const textLayers = Array.isArray(summary.textLayers) ? summary.textLayers : [];
  const sampleNodes = Array.isArray(summary.sampleNodes) ? summary.sampleNodes : [];
  const actionNodes = Array.isArray(summary.actionNodes) ? summary.actionNodes : [];

  return {
    frameName: trimText(summary.frameName, 80),
    nodeId: trimText(summary.nodeId, 40),
    width: summary.width || 0,
    height: summary.height || 0,
    layers: summary.layers || 0,
    patterns: Array.isArray(summary.patterns) ? summary.patterns.slice(0, 8) : [],
    textLayers: textLayers
      .filter((layer) => trimText(layer.characters, 1) || trimText(layer.name, 1))
      .slice(0, MAX_TEXT_LAYERS)
      .map((layer) => compactLayer(layer, 100)),
    actionNodes: actionNodes.slice(0, MAX_ACTION_NODES).map((node) => compactLayer(node, 0)),
    sampleNodes: sampleNodes.slice(0, MAX_SAMPLE_NODES).map((node) => compactLayer(node, 0))
  };
}

function compactLocalFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.slice(0, 5).map((finding) => ({
    id: finding.id,
    severity: finding.severity,
    category: trimText(finding.category, 32),
    title: trimText(finding.title, 80),
    layerId: finding.layerId,
    layerName: trimText(finding.layerName, 60)
  }));
}

function buildPrompt(payload) {
  const summary = compactSummary(payload.summary || {});
  return [
    {
      role: "system",
      content: [
        "You are Meyar Clarity, a concise B2B SaaS UX clarity reviewer inside Figma.",
        "Find only high-signal issues that affect comprehension, workflow speed, trust, conversion, or handoff readiness.",
        "Ground findings in the supplied compact frame data. Prefer specific, short recommendations.",
        "Return JSON only."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        context: payload.config || {},
        frame: summary,
        localFindings: compactLocalFindings(payload.localFindings)
      })
    }
  ];
}

const auditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "complexity", "findings", "states"],
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    complexity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
    findings: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "severity", "category", "title", "layerId", "layerName", "confidence", "recommendation", "why", "evidence"],
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["must", "should", "consider"] },
          category: { type: "string" },
          title: { type: "string" },
          layerId: { type: "string" },
          layerName: { type: "string" },
          confidence: { type: "string", enum: ["High", "Medium", "Low"] },
          recommendation: { type: "string" },
          why: { type: "string" },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "string" }
          }
        }
      }
    },
    states: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "table", "form", "billing"],
        properties: {
          name: { type: "string" },
          table: { type: "string", enum: ["Present", "Missing", "Unclear"] },
          form: { type: "string", enum: ["Present", "Missing", "Unclear"] },
          billing: { type: "string", enum: ["Present", "Missing", "Unclear"] }
        }
      }
    }
  }
};

function normalizeAudit(aiAudit, fallbackSummary) {
  const findings = Array.isArray(aiAudit.findings) ? aiAudit.findings : [];
  return {
    score: typeof aiAudit.score === "number" ? Math.max(0, Math.min(100, Math.round(aiAudit.score))) : 70,
    complexity: ["Low", "Medium", "High", "Critical"].includes(aiAudit.complexity) ? aiAudit.complexity : "Medium",
    findings: findings.map((finding, index) => ({
      id: finding.id || `AI-${String(index + 1).padStart(3, "0")}`,
      severity: ["must", "should", "consider"].includes(finding.severity) ? finding.severity : "should",
      category: finding.category || "Clarity",
      title: finding.title || "Review this area",
      layerId: finding.layerId || fallbackSummary.nodeId,
      layerName: finding.layerName || fallbackSummary.frameName,
      confidence: ["High", "Medium", "Low"].includes(finding.confidence) ? finding.confidence : "Medium",
      recommendation: finding.recommendation || "Clarify the design intent before handoff.",
      why: finding.why || "This may affect user clarity or decision speed.",
      evidence: Array.isArray(finding.evidence) && finding.evidence.length ? finding.evidence : ["AI reviewed the provided frame structure"]
    })),
    states: Array.isArray(aiAudit.states) ? aiAudit.states : []
  };
}

async function runOpenAiAudit(payload) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: buildPrompt(payload),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "meyar_clarity_audit",
          strict: true,
          schema: auditSchema
        }
      },
      store: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const outputText = data.output_text || data.output?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("");

  if (!outputText) throw new Error("OpenAI response did not include output text.");
  return normalizeAudit(JSON.parse(outputText), payload.summary || {});
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "Meyar Clarity AI backend",
      model: OPENAI_MODEL,
      hasApiKey: Boolean(OPENAI_API_KEY)
    });
    return;
  }

  if (req.method === "POST" && req.url === "/audit") {
    try {
      const payload = await readJson(req);
      if (!OPENAI_API_KEY) {
        sendJson(res, 200, {
          ok: false,
          fallback: true,
          error: "OPENAI_API_KEY is not set. Plugin will use local heuristic audit."
        });
        return;
      }

      const audit = await runOpenAiAudit(payload);
      sendJson(res, 200, { ok: true, audit });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        fallback: true,
        error: error.message || "AI audit failed. Plugin will use local heuristic audit."
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Meyar Clarity AI backend running on http://localhost:${PORT}`);
  console.log(OPENAI_API_KEY ? `Using model ${OPENAI_MODEL}` : "OPENAI_API_KEY is not set; plugin will use fallback audits.");
  console.log(`Token controls: max output ${MAX_OUTPUT_TOKENS}, text layers ${MAX_TEXT_LAYERS}, nodes ${MAX_SAMPLE_NODES}.`);
});
