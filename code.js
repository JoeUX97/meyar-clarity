figma.showUI(__html__, { width: 360, height: 620, themeColors: true });

function isVisibleSceneNode(node) {
  return "visible" in node ? node.visible !== false : true;
}

function walk(node, list) {
  if (!isVisibleSceneNode(node)) return;
  list.push(node);
  if ("children" in node) {
    for (const child of node.children) walk(child, list);
  }
}

function getPaintSummary(node) {
  if (!("fills" in node) || !Array.isArray(node.fills)) return null;
  const solid = node.fills.find((paint) => paint && paint.type === "SOLID" && paint.visible !== false);
  if (!solid) return null;
  const color = solid.color;
  return {
    r: Math.round(color.r * 255),
    g: Math.round(color.g * 255),
    b: Math.round(color.b * 255),
    opacity: typeof solid.opacity === "number" ? solid.opacity : 1
  };
}

function getSelectionSummary() {
  const selection = figma.currentPage.selection;

  if (!selection.length) {
    return {
      hasSelection: false,
      selectionCount: 0,
      frameName: "No frame selected",
      width: 0,
      height: 0,
      layers: 0,
      textLayers: [],
      patterns: []
    };
  }

  const root = selection[0];
  const nodes = [];
  walk(root, nodes);

  const textLayers = nodes
    .filter((node) => node.type === "TEXT")
    .slice(0, 45)
    .map((node) => ({
      id: node.id,
      name: node.name,
      characters: node.characters.slice(0, 120),
      width: Math.round("width" in node ? node.width : 0),
      height: Math.round("height" in node ? node.height : 0),
      x: Math.round("x" in node ? node.x : 0),
      y: Math.round("y" in node ? node.y : 0)
    }));

  const names = nodes.map((node) => node.name.toLowerCase()).join(" ");
  const text = textLayers.map((layer) => layer.characters.toLowerCase()).join(" ");
  const haystack = `${names} ${text}`;
  const patterns = [];

  if (/table|row|column|filter|sort|status|date/.test(haystack)) patterns.push("Table");
  if (/form|input|field|email|name|required|save|cancel/.test(haystack)) patterns.push("Form");
  if (/setting|permission|role|admin|billing|workspace/.test(haystack)) patterns.push("Settings");
  if (/modal|dialog|confirm|delete|warning/.test(haystack)) patterns.push("Modal");
  if (/chart|metric|revenue|analytics|dashboard|report/.test(haystack)) patterns.push("Dashboard");
  if (!patterns.length) patterns.push("Screen");

  return {
    hasSelection: true,
    selectionCount: selection.length,
    frameName: selection.length === 1 ? root.name : `${selection.length} selected frames`,
    nodeId: root.id,
    width: Math.round("width" in root ? root.width : 0),
    height: Math.round("height" in root ? root.height : 0),
    layers: nodes.length,
    textLayers,
    patterns: [...new Set(patterns)],
    actionNodes: nodes
      .filter((node) => /button|btn|save|send|add|create|invite|delete|remove|export|submit|continue|next|cancel/i.test(`${node.name} ${node.type}`))
      .slice(0, 20)
      .map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        width: Math.round("width" in node ? node.width : 0),
        height: Math.round("height" in node ? node.height : 0),
        x: Math.round("x" in node ? node.x : 0),
        y: Math.round("y" in node ? node.y : 0)
      })),
    sampleNodes: nodes.slice(0, 60).map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      width: Math.round("width" in node ? node.width : 0),
      height: Math.round("height" in node ? node.height : 0),
      x: Math.round("x" in node ? node.x : 0),
      y: Math.round("y" in node ? node.y : 0),
      fill: getPaintSummary(node)
    }))
  };
}

function hasText(summary, pattern) {
  return summary.textLayers.some((layer) => pattern.test(`${layer.name} ${layer.characters}`));
}

function firstText(summary, pattern) {
  return summary.textLayers.find((layer) => pattern.test(`${layer.name} ${layer.characters}`));
}

function firstNode(summary, pattern) {
  return summary.sampleNodes.find((node) => pattern.test(node.name));
}

function makeFinding(index, options) {
  return {
    id: `MC-${String(index).padStart(3, "0")}`,
    ...options
  };
}

function makeFindings(config, summary) {
  const findings = [];
  const actionNodes = summary.actionNodes || [];
  const actionText = summary.textLayers.filter((layer) => /save|send|add|create|invite|delete|remove|export|submit|continue|next|cancel/i.test(layer.characters));
  const destructive = firstText(summary, /delete|remove|disable|deactivate|cancel plan|downgrade|revoke/i);
  const permission = firstText(summary, /permission|admin|role|access|owner|member|viewer|editor/i);
  const billing = firstText(summary, /billing|invoice|payment|plan|seat|subscription|price|trial/i);
  const table = firstNode(summary, /table|row|column|filter|sort|cell/i);
  const filter = firstText(summary, /filter|sort|status|date range|search/i) || firstNode(summary, /filter|sort|search/i);
  const errorState = hasText(summary, /error|failed|try again|unable|problem/i);
  const emptyState = hasText(summary, /empty|no results|no data|nothing here|create your first/i);
  const loadingState = hasText(summary, /loading|syncing|please wait/i);
  const longLabels = summary.textLayers.filter((layer) => layer.characters.length > 76);
  const unnamed = summary.sampleNodes.filter((node) => /^(frame|group|rectangle|instance)\s*\d*$/i.test(node.name)).length;
  const duplicateLabels = {};

  for (const layer of summary.textLayers) {
    const key = layer.characters.trim().toLowerCase();
    if (key && key.length < 32) duplicateLabels[key] = (duplicateLabels[key] || 0) + 1;
  }

  if (actionNodes.length + actionText.length >= 4) {
    const target = actionNodes[0] || actionText[0] || { id: summary.nodeId, name: summary.frameName };
    findings.push(makeFinding(findings.length + 1, {
      severity: "must",
      category: "Hierarchy",
      title: "Primary actions compete for attention",
      layerId: target.id,
      layerName: target.name || summary.frameName,
      confidence: actionNodes.length >= 3 ? "High" : "Medium",
      recommendation: "Keep one filled primary action for the main task. Move secondary actions into neutral buttons, text links, or an overflow menu.",
      why: "Busy SaaS users need a clear next step. Multiple strong actions increase hesitation and make the workflow feel riskier than it is.",
      evidence: [`Detected ${actionNodes.length + actionText.length} action-like layers or labels`, "Common SaaS toolbar and settings screens need one dominant next action"]
    }));
  }

  if (summary.patterns.includes("Table") || table) {
    const target = filter || table || { id: summary.nodeId, name: summary.frameName };
    findings.push(makeFinding(findings.length + 1, {
      severity: "should",
      category: "Density",
      title: "Table controls need stronger grouping",
      layerId: target.id,
      layerName: target.name || target.characters || summary.frameName,
      confidence: summary.patterns.includes("Table") ? "High" : "Medium",
      recommendation: "Separate search, filters, sort, bulk actions, and export into predictable zones with consistent spacing and labels.",
      why: "Tables are repeated-work surfaces. If controls are hard to scan, daily users lose time on every visit.",
      evidence: ["Table pattern detected", filter ? `Found related control: ${filter.name || filter.characters}` : "Filter/search/sort controls may be present"]
    }));
  }

  if (permission) {
    findings.push(makeFinding(findings.length + 1, {
      severity: "must",
      category: "Access control",
      title: "Permission impact should be clearer",
      layerId: permission.id,
      layerName: permission.name,
      confidence: "High",
      recommendation: "Explain what this role can do, what it cannot do, and whether the change affects billing or security before the user saves.",
      why: "Role and permission changes are high-trust actions. Ambiguous copy can create security mistakes or support tickets.",
      evidence: [`Found permission-related copy: ${permission.characters.slice(0, 100)}`]
    }));
  }

  if (billing) {
    findings.push(makeFinding(findings.length + 1, {
      severity: "should",
      category: "Billing clarity",
      title: "Billing consequence needs confirmation",
      layerId: billing.id,
      layerName: billing.name,
      confidence: "High",
      recommendation: "Show the pricing, renewal, seat, or invoice consequence close to the action that changes it.",
      why: "B2B billing screens need extra clarity because mistakes affect teams, approvals, and finance workflows.",
      evidence: [`Found billing-related copy: ${billing.characters.slice(0, 100)}`]
    }));
  }

  if (destructive) {
    findings.push(makeFinding(findings.length + 1, {
      severity: "must",
      category: "Risk prevention",
      title: "Destructive action needs a safer confirmation path",
      layerId: destructive.id,
      layerName: destructive.name,
      confidence: "High",
      recommendation: "Use explicit confirmation copy, explain what will happen, and make the destructive action visually distinct from normal actions.",
      why: "Enterprise users often act on behalf of a team. Destructive changes need friction that prevents accidental damage.",
      evidence: [`Found destructive copy: ${destructive.characters.slice(0, 100)}`]
    }));
  }

  if (summary.layers > 90 || summary.textLayers.length > 45) {
    findings.push(makeFinding(findings.length + 1, {
      severity: "should",
      category: "Complexity",
      title: "Screen may be too dense for first-pass scanning",
      layerId: summary.nodeId,
      layerName: summary.frameName,
      confidence: summary.layers > 120 ? "High" : "Medium",
      recommendation: "Break the screen into clearer zones, reduce simultaneous decisions, and keep advanced controls collapsed until needed.",
      why: "Dense SaaS screens are powerful, but users still need to find their next decision quickly.",
      evidence: [`Detected ${summary.layers} visible layers`, `Detected ${summary.textLayers.length} text layers`]
    }));
  }

  if (longLabels.length >= 3) {
    findings.push(makeFinding(findings.length + 1, {
      severity: "should",
      category: "Content clarity",
      title: "Several labels are long enough to slow scanning",
      layerId: longLabels[0].id,
      layerName: longLabels[0].name,
      confidence: "Medium",
      recommendation: "Shorten labels where possible and move explanation into helper text, tooltips, or progressive disclosure.",
      why: "Long inline copy makes dense admin screens feel heavier and hides the structure users need to scan.",
      evidence: [`Found ${longLabels.length} text layers longer than 76 characters`]
    }));
  }

  if (!emptyState || !errorState || !loadingState) {
    findings.push(makeFinding(findings.length + 1, {
      severity: "should",
      category: "States",
      title: "Important UI states are missing or unclear",
      layerId: summary.nodeId,
      layerName: summary.frameName,
      confidence: "Medium",
      recommendation: "Add explicit empty, loading, and error states before handoff, especially for tables, forms, and billing flows.",
      why: "Missing states create product gaps that often reach engineering late and lead to inconsistent experiences.",
      evidence: [
        emptyState ? "Empty state copy detected" : "No empty state copy detected",
        loadingState ? "Loading state copy detected" : "No loading state copy detected",
        errorState ? "Error state copy detected" : "No error state copy detected"
      ]
    }));
  }

  if (unnamed > 18) {
    findings.push(makeFinding(findings.length + 1, {
      severity: "consider",
      category: "Handoff",
      title: "Layer naming may slow review and handoff",
      layerId: summary.nodeId,
      layerName: summary.frameName,
      confidence: "Medium",
      recommendation: "Rename major sections and reusable parts so PMs, designers, and engineers can discuss issues precisely.",
      why: "Clear layer names make audit findings easier to trace and reduce handoff confusion.",
      evidence: [`Found ${unnamed} generic frame, group, rectangle, or instance names`]
    }));
  }

  const repeated = Object.keys(duplicateLabels).filter((key) => duplicateLabels[key] >= 3 && !/^(yes|no|ok|on|off)$/.test(key));
  if (repeated.length) {
    const repeatedLayer = firstText(summary, new RegExp(repeated[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    findings.push(makeFinding(findings.length + 1, {
      severity: "consider",
      category: "Consistency",
      title: "Repeated labels may need clearer context",
      layerId: repeatedLayer ? repeatedLayer.id : summary.nodeId,
      layerName: repeatedLayer ? repeatedLayer.name : summary.frameName,
      confidence: "Medium",
      recommendation: "Check repeated labels for context. If the same word appears in different zones, add clearer section labels or action labels.",
      why: "Repeated generic labels can make enterprise screens harder to navigate, especially with many similar rows or cards.",
      evidence: [`Label repeated several times: ${repeated[0]}`]
    }));
  }

  if (!findings.length) {
    findings.push(makeFinding(1, {
      severity: "consider",
      category: "Clarity",
      title: "No major local issues detected",
      layerId: summary.nodeId,
      layerName: summary.frameName,
      confidence: "Medium",
      recommendation: "Run this screen with the real user goal once AI review is connected. Local rules did not find a major SaaS clarity issue.",
      why: "Some UX risks depend on intent, workflow order, and domain context that deterministic inspection cannot fully infer.",
      evidence: ["Local audit completed", "No high-risk pattern crossed the current threshold"]
    }));
  }

  return findings.slice(0, config.strictness === "Fast pass" ? 5 : 9);
}

function evaluateStates(summary) {
  const present = (pattern) => hasText(summary, pattern);
  const tablePresent = summary.patterns.includes("Table");
  const formPresent = summary.patterns.includes("Form");
  const billingPresent = summary.patterns.includes("Settings") || hasText(summary, /billing|plan|payment|invoice|subscription/i);

  return [
    {
      name: "Empty",
      table: present(/empty|no results|no data|nothing here|create your first/i) ? "Present" : tablePresent ? "Missing" : "Unclear",
      form: present(/empty|blank|start by/i) ? "Present" : formPresent ? "Unclear" : "Unclear",
      billing: present(/no invoice|no payment|no plan/i) ? "Present" : billingPresent ? "Unclear" : "Unclear"
    },
    {
      name: "Loading",
      table: present(/loading|syncing|please wait/i) ? "Present" : tablePresent ? "Missing" : "Unclear",
      form: present(/loading|saving|submitting/i) ? "Present" : formPresent ? "Unclear" : "Unclear",
      billing: present(/loading|updating plan|processing/i) ? "Present" : billingPresent ? "Missing" : "Unclear"
    },
    {
      name: "Error",
      table: present(/error|failed|try again|unable/i) ? "Present" : tablePresent ? "Missing" : "Unclear",
      form: present(/required|invalid|error|failed/i) ? "Present" : formPresent ? "Missing" : "Unclear",
      billing: present(/payment failed|card declined|invoice failed|error/i) ? "Present" : billingPresent ? "Unclear" : "Unclear"
    },
    {
      name: "No permission",
      table: present(/permission|access denied|not allowed|admin only/i) ? "Present" : tablePresent ? "Unclear" : "Unclear",
      form: present(/permission|admin only|not allowed/i) ? "Present" : formPresent ? "Unclear" : "Unclear",
      billing: present(/owner|billing admin|permission|admin only/i) ? "Present" : billingPresent ? "Missing" : "Unclear"
    },
    {
      name: "Unsaved changes",
      table: present(/unsaved|discard changes|leave without saving/i) ? "Present" : "Unclear",
      form: present(/unsaved|discard changes|save changes/i) ? "Present" : formPresent ? "Missing" : "Unclear",
      billing: present(/unsaved|discard changes|save changes/i) ? "Present" : billingPresent ? "Missing" : "Unclear"
    },
    {
      name: "Destructive confirmation",
      table: present(/delete|remove|confirm|destructive/i) ? "Present" : "Unclear",
      form: present(/delete|remove|confirm|destructive/i) ? "Present" : "Unclear",
      billing: present(/cancel plan|downgrade|delete|remove|confirm/i) ? "Present" : billingPresent ? "Missing" : "Unclear"
    }
  ];
}

function runLocalAudit(config) {
  const summary = getSelectionSummary();
  const findings = makeFindings(config, summary);
  const mustCount = findings.filter((finding) => finding.severity === "must").length;
  const shouldCount = findings.filter((finding) => finding.severity === "should").length;
  const considerCount = findings.filter((finding) => finding.severity === "consider").length;
  const densityPenalty = Math.min(16, Math.floor(summary.layers / 35));
  const score = Math.max(32, 94 - mustCount * 14 - shouldCount * 7 - considerCount * 3 - densityPenalty);

  return {
    summary,
    score,
    complexity: summary.layers > 120 ? "Critical" : summary.layers > 55 ? "High" : summary.layers > 20 ? "Medium" : "Low",
    findings,
    states: evaluateStates(summary),
    mode: "Local heuristic audit"
  };
}

async function runAudit(config) {
  const localAudit = runLocalAudit(config);

  try {
    const response = await fetch("http://localhost:8787/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config,
        summary: localAudit.summary,
        localFindings: localAudit.findings,
        localStates: localAudit.states
      })
    });

    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    const result = await response.json();

    if (!result.ok || !result.audit) {
      return {
        ...localAudit,
        mode: "Local heuristic audit",
        backendMessage: result.error || "AI backend unavailable."
      };
    }

    return {
      ...result.audit,
      summary: localAudit.summary,
      mode: "AI audit",
      backendMessage: "AI backend connected."
    };
  } catch (error) {
    return {
      ...localAudit,
      mode: "Local heuristic audit",
      backendMessage: "AI backend unavailable. Using local audit."
    };
  }
}

async function focusNode(nodeId) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !("x" in node)) {
    figma.notify("Layer is no longer available.");
    return;
  }
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

async function createAnnotation(finding) {
  const selection = figma.currentPage.selection;
  const target = selection[0] || figma.currentPage;
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const note = figma.createFrame();
  note.name = `Meyar Clarity note - ${finding.id}`;
  note.resize(280, 160);
  note.fills = [{ type: "SOLID", color: { r: 1, g: 0.98, b: 0.9 } }];
  note.strokes = [{ type: "SOLID", color: { r: 0.95, g: 0.72, b: 0.22 } }];
  note.cornerRadius = 8;
  note.layoutMode = "VERTICAL";
  note.primaryAxisSizingMode = "AUTO";
  note.counterAxisSizingMode = "FIXED";
  note.paddingTop = 14;
  note.paddingRight = 14;
  note.paddingBottom = 14;
  note.paddingLeft = 14;
  note.itemSpacing = 8;

  const title = figma.createText();
  title.fontName = { family: "Inter", style: "Bold" };
  title.fontSize = 14;
  title.characters = `${finding.id} - ${finding.title}`;
  title.fills = [{ type: "SOLID", color: { r: 0.22, g: 0.16, b: 0.05 } }];

  const body = figma.createText();
  body.fontName = { family: "Inter", style: "Regular" };
  body.fontSize = 11;
  body.lineHeight = { value: 16, unit: "PIXELS" };
  body.resize(252, 92);
  body.characters = finding.recommendation;
  body.fills = [{ type: "SOLID", color: { r: 0.28, g: 0.22, b: 0.12 } }];

  note.appendChild(title);
  note.appendChild(body);

  if ("x" in target) {
    note.x = target.x + ("width" in target ? target.width + 32 : 32);
    note.y = target.y;
  } else {
    note.x = figma.viewport.center.x;
    note.y = figma.viewport.center.y;
  }

  figma.currentPage.appendChild(note);
  figma.currentPage.selection = [note];
  figma.notify("Meyar Clarity note added.");
}

async function createReport(data) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const report = figma.createFrame();
  report.name = "Meyar Clarity audit summary";
  report.resize(720, 520);
  report.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  report.strokes = [{ type: "SOLID", color: { r: 0.86, g: 0.88, b: 0.92 } }];
  report.cornerRadius = 12;
  report.layoutMode = "VERTICAL";
  report.paddingTop = 32;
  report.paddingRight = 32;
  report.paddingBottom = 32;
  report.paddingLeft = 32;
  report.itemSpacing = 18;

  const title = figma.createText();
  title.fontName = { family: "Inter", style: "Bold" };
  title.fontSize = 26;
  title.characters = `Meyar Clarity audit: ${data.summary.frameName}`;

  const meta = figma.createText();
  meta.fontName = { family: "Inter", style: "Regular" };
  meta.fontSize = 14;
  meta.characters = `Score ${data.score}/100 - Complexity ${data.complexity} - ${data.findings.length} findings`;

  const list = figma.createText();
  list.fontName = { family: "Inter", style: "Regular" };
  list.fontSize = 14;
  list.lineHeight = { value: 22, unit: "PIXELS" };
  list.resize(650, 320);
  list.characters = data.findings
    .map((finding) => `${finding.id} - ${finding.title}\n${finding.recommendation}`)
    .join("\n\n");

  report.appendChild(title);
  report.appendChild(meta);
  report.appendChild(list);
  report.x = figma.viewport.center.x - 360;
  report.y = figma.viewport.center.y - 260;
  figma.currentPage.appendChild(report);
  figma.currentPage.selection = [report];
  figma.viewport.scrollAndZoomIntoView([report]);
  figma.notify("Meyar Clarity report created.");
}

figma.ui.postMessage({ type: "selection", payload: getSelectionSummary() });

figma.on("selectionchange", () => {
  figma.ui.postMessage({ type: "selection", payload: getSelectionSummary() });
});

figma.ui.onmessage = async (message) => {
  if (message.type === "get-selection") {
    figma.ui.postMessage({ type: "selection", payload: getSelectionSummary() });
  }

  if (message.type === "run-audit") {
    const data = await runAudit(message.config || {});
    figma.ui.postMessage({ type: "audit-result", payload: data });
  }

  if (message.type === "show-layer") {
    await focusNode(message.nodeId);
  }

  if (message.type === "create-note") {
    await createAnnotation(message.finding);
  }

  if (message.type === "create-report") {
    await createReport(message.data);
  }
};
