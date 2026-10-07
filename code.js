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
    mode: "Free local"
  };
}

async function runAudit(config) {
  return runLocalAudit(config || {});
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

const MEYAR_LOGO_BASE64 = "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";

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function makeLogoNode(width, height) {
  const logo = figma.createRectangle();
  logo.name = "Meyar logo";
  logo.resize(width, height);
  const image = figma.createImage(base64ToBytes(MEYAR_LOGO_BASE64));
  logo.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
  return logo;
}
function rgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255
  };
}

function severityLabelForReport(severity) {
  if (severity === "must") return "High";
  if (severity === "should") return "Medium";
  return "Low";
}

function severityColors(severity) {
  if (severity === "must") return { text: "#8f1d18", fill: "#f7e7e4", dot: "#b42318" };
  if (severity === "should") return { text: "#765000", fill: "#f4ead2", dot: "#c98200" };
  return { text: "#23543a", fill: "#e5f0e9", dot: "#276749" };
}

async function makeText(characters, options = {}) {
  const text = figma.createText();
  text.fontName = { family: "Inter", style: options.bold ? "Bold" : "Regular" };
  text.fontSize = options.size || 12;
  text.lineHeight = { value: options.lineHeight || Math.round((options.size || 12) * 1.35), unit: "PIXELS" };
  text.characters = String(characters || "");
  text.fills = [{ type: "SOLID", color: rgb(options.color || "#111111") }];
  if (options.width) text.resize(options.width, text.height);
  return text;
}

function makeFrame(name, options = {}) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.fills = [{ type: "SOLID", color: rgb(options.fill || "#ffffff") }];
  frame.strokes = options.stroke === false ? [] : [{ type: "SOLID", color: rgb(options.stroke || "#e7e5e1") }];
  frame.cornerRadius = options.radius === undefined ? 8 : options.radius;
  frame.layoutMode = options.layout || "VERTICAL";
  frame.itemSpacing = options.gap === undefined ? 8 : options.gap;
  frame.paddingTop = options.paddingTop === undefined ? options.padding || 12 : options.paddingTop;
  frame.paddingRight = options.paddingRight === undefined ? options.padding || 12 : options.paddingRight;
  frame.paddingBottom = options.paddingBottom === undefined ? options.padding || 12 : options.paddingBottom;
  frame.paddingLeft = options.paddingLeft === undefined ? options.padding || 12 : options.paddingLeft;
  if (options.width && options.height) frame.resize(options.width, options.height);
  else if (options.width) frame.resize(options.width, frame.height);
  frame.primaryAxisSizingMode = options.primarySizing || (frame.layoutMode === "HORIZONTAL" && options.width ? "FIXED" : "AUTO");
  frame.counterAxisSizingMode = options.counterSizing || (frame.layoutMode === "VERTICAL" && options.width ? "FIXED" : "AUTO");
  return frame;
}

async function makePill(label, options = {}) {
  const pill = makeFrame(`Pill - ${label}`, {
    fill: options.fill || "#f3f2ef",
    stroke: false,
    radius: 999,
    layout: "HORIZONTAL",
    counterSizing: "AUTO",
    paddingTop: 6,
    paddingRight: 10,
    paddingBottom: 6,
    paddingLeft: 10,
    gap: 6
  });

  if (options.dot) {
    const dot = figma.createEllipse();
    dot.name = "Severity dot";
    dot.resize(7, 7);
    dot.fills = [{ type: "SOLID", color: rgb(options.dot) }];
    pill.appendChild(dot);
  }

  pill.appendChild(await makeText(label, { size: 11, bold: true, color: options.color || "#111111" }));
  return pill;
}

async function makeSummaryCard(label, value, detail, width, tone = {}) {
  const card = makeFrame(`Summary - ${label}`, {
    width,
    fill: tone.fill || "#ffffff",
    stroke: tone.stroke || "#e7e5e1",
    paddingTop: 18,
    paddingRight: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    gap: 10
  });
  const top = makeFrame(`${label} top`, { width: width - 36, fill: tone.fill || "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", padding: 0, gap: 8 });
  top.primaryAxisAlignItems = "SPACE_BETWEEN";
  top.counterAxisAlignItems = "CENTER";
  top.appendChild(await makeText(label, { size: 13, bold: true, color: tone.label || "#111111" }));
  if (tone.dot) {
    const dot = figma.createEllipse();
    dot.name = `${label} accent`;
    dot.resize(8, 8);
    dot.fills = [{ type: "SOLID", color: rgb(tone.dot) }];
    top.appendChild(dot);
  }
  card.appendChild(top);
  card.appendChild(await makeText(value, { size: 30, bold: true, color: tone.value || "#111111" }));
  card.appendChild(await makeText(detail, { size: 12, color: tone.detail || "#555555", width: width - 36, lineHeight: 17 }));
  return card;
}

async function makeFindingRow(finding, widths, isHeader = false) {
  const row = makeFrame(isHeader ? "Findings table header" : `Finding row - ${finding.title}`, {
    width: widths.reduce((sum, width) => sum + width, 0),
    fill: isHeader ? "#fafafa" : "#ffffff",
    stroke: false,
    radius: 0,
    layout: "HORIZONTAL",
    padding: 0,
    gap: 0
  });

  const cells = isHeader
    ? ["Severity", "Finding", "Evidence", "Recommendation", "Layer"]
    : [severityLabelForReport(finding.severity), finding.title, (finding.evidence || [""])[0], finding.recommendation, finding.layerName];

  for (let index = 0; index < cells.length; index += 1) {
    const cell = makeFrame(`Cell ${index + 1}`, {
      width: widths[index],
      fill: isHeader ? "#fafafa" : "#ffffff",
      stroke: false,
      radius: 0,
      paddingTop: 12,
      paddingRight: 10,
      paddingBottom: 12,
      paddingLeft: 10,
      gap: 0
    });

    if (!isHeader && index === 0) {
      const colors = severityColors(finding.severity);
      cell.appendChild(await makePill(cells[index], colors));
    } else {
      cell.appendChild(await makeText(cells[index], {
        size: isHeader ? 11 : 11.5,
        bold: isHeader || index === 1,
        color: isHeader ? "#666666" : "#222222",
        width: widths[index] - 20,
        lineHeight: isHeader ? 15 : 16
      }));
    }

    row.appendChild(cell);
  }

  return row;
}

async function makeStateRow(rowData) {
  const row = makeFrame(`State - ${rowData.name}`, {
    width: 500,
    fill: "#ffffff",
    stroke: false,
    radius: 0,
    layout: "HORIZONTAL",
    paddingTop: 6,
    paddingRight: 0,
    paddingBottom: 6,
    paddingLeft: 0,
    gap: 8
  });
  row.appendChild(await makeText(rowData.name, { size: 12, color: "#333333", width: 300 }));
  const value = [rowData.table, rowData.form, rowData.billing].includes("Missing") ? "Missing" : [rowData.table, rowData.form, rowData.billing].includes("Unclear") ? "Unclear" : "Present";
  const colors = value === "Missing" ? { color: "#8f1d18", fill: "#f7e7e4", dot: "#b42318" } : value === "Unclear" ? { color: "#765000", fill: "#f4ead2", dot: "#c98200" } : { color: "#23543a", fill: "#e5f0e9", dot: "#276749" };
  row.appendChild(await makePill(value, colors));
  return row;
}

async function createReport(data) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const findings = data.findings || [];
  const highCount = findings.filter((finding) => finding.severity === "must").length;
  const mediumCount = findings.filter((finding) => finding.severity === "should").length;
  const lowCount = findings.filter((finding) => finding.severity !== "must" && finding.severity !== "should").length;
  const frameName = data.summary && data.summary.frameName ? data.summary.frameName : "Selected frame";
  const mode = data.mode || "Free local review";

  const report = makeFrame("Meyar Clarity - Review summary", {
    width: 1280,
    fill: "#ffffff",
    stroke: "#d9d7d2",
    radius: 10,
    paddingTop: 28,
    paddingRight: 28,
    paddingBottom: 22,
    paddingLeft: 28,
    gap: 18
  });

  const header = makeFrame("Report header", { width: 1224, fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", padding: 0, gap: 0 });
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  const brand = makeFrame("Brand", { fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", counterSizing: "AUTO", padding: 0, gap: 10 });
  const logo = makeLogoNode(132, 32);
  brand.appendChild(logo);
  header.appendChild(brand);
  header.appendChild(await makeText(`${frameName}   |   SaaS product   |   ${mode}   |   Oct 2026`, { size: 11, color: "#666666", width: 460 }));
  report.appendChild(header);

  const divider = figma.createLine();
  divider.name = "Header divider";
  divider.resize(1224, 0);
  divider.strokes = [{ type: "SOLID", color: rgb("#e7e5e1") }];
  report.appendChild(divider);

  report.appendChild(await makeText("Review summary", { size: 32, bold: true }));
  report.appendChild(await makeText("UX clarity, missing states, and handoff risks before implementation.", { size: 16, color: "#666666", width: 900 }));

  const summaryRow = makeFrame("Score summary", { width: 1224, fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", padding: 0, gap: 12 });
  summaryRow.appendChild(await makeSummaryCard("Readiness", `${data.score || 0} / 100`, data.score >= 75 ? "Ready with light improvements before handoff." : "Needs focused improvements before handoff.", 400, {
    fill: "#f3eee4",
    stroke: "#ded2bd",
    dot: "#9a6b2f",
    label: "#3f3424",
    value: "#111111",
    detail: "#5f5446"
  }));
  summaryRow.appendChild(await makeSummaryCard("Complexity", data.complexity || "Medium", "Estimated implementation and review effort.", 400, {
    fill: "#f1f2ee",
    stroke: "#d7d9cf",
    dot: "#66705c",
    label: "#333a2e",
    value: "#111111",
    detail: "#535b4b"
  }));
  summaryRow.appendChild(await makeSummaryCard("Findings", `${findings.length} total`, `${highCount} high, ${mediumCount} medium, ${lowCount} low`, 400, {
    fill: "#f4eceb",
    stroke: "#dfcbc8",
    dot: "#9d2d25",
    label: "#442a27",
    value: "#111111",
    detail: "#634c49"
  }));
  report.appendChild(summaryRow);

  const severity = makeFrame("Severity overview", { width: 1224, fill: "#ffffff", padding: 18, gap: 10 });
  const severityTop = makeFrame("Severity content", { width: 1188, fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", padding: 0, gap: 24 });
  severityTop.primaryAxisAlignItems = "SPACE_BETWEEN";
  const severityCopy = makeFrame("Severity copy", { fill: "#ffffff", stroke: false, radius: 0, padding: 0, gap: 4 });
  severityCopy.appendChild(await makeText("Severity overview", { size: 15, bold: true }));
  severityCopy.appendChild(await makeText("Prioritize high-severity findings before handoff.", { size: 13, color: "#666666" }));
  const severityPills = makeFrame("Severity pills", { fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", counterSizing: "AUTO", padding: 0, gap: 12 });
  severityPills.appendChild(await makePill(`High ${highCount}`, severityColors("must")));
  severityPills.appendChild(await makePill(`Medium ${mediumCount}`, severityColors("should")));
  severityPills.appendChild(await makePill(`Low ${lowCount}`, severityColors("consider")));
  severityTop.appendChild(severityCopy);
  severityTop.appendChild(severityPills);
  severity.appendChild(severityTop);
  report.appendChild(severity);

  const table = makeFrame("Findings", { width: 1224, fill: "#ffffff", padding: 0, gap: 0 });
  const tableTitle = makeFrame("Findings title", { width: 1224, fill: "#ffffff", stroke: false, radius: 0, paddingTop: 14, paddingRight: 18, paddingBottom: 14, paddingLeft: 18 });
  tableTitle.appendChild(await makeText("Findings", { size: 16, bold: true }));
  table.appendChild(tableTitle);
  const widths = [120, 250, 300, 360, 194];
  table.appendChild(await makeFindingRow({}, widths, true));
  for (const finding of findings.slice(0, 5)) table.appendChild(await makeFindingRow(finding, widths, false));
  report.appendChild(table);

  const bottom = makeFrame("Bottom sections", { width: 1224, fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", padding: 0, gap: 16 });
  const states = makeFrame("Missing states", { width: 570, fill: "#ffffff", padding: 18, gap: 6 });
  states.appendChild(await makeText("Missing states", { size: 16, bold: true }));
  for (const stateRow of (data.states || []).slice(0, 6)) states.appendChild(await makeStateRow(stateRow));

  const recommendations = makeFrame("Recommendation summary", { width: 638, fill: "#ffffff", padding: 18, gap: 14 });
  recommendations.appendChild(await makeText("Recommendation summary", { size: 16, bold: true }));
  const recs = findings.slice(0, 3).map((finding) => finding.recommendation);
  const fallbackRecs = [
    "Clarify the primary action and reduce competing CTAs.",
    "Add missing permission and billing edge states.",
    "Prepare handoff notes for table filters and state coverage."
  ];
  for (let index = 0; index < 3; index += 1) {
    const rec = recs[index] || fallbackRecs[index];
    const row = makeFrame(`Recommendation ${index + 1}`, { width: 602, fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", padding: 0, gap: 14 });
    row.appendChild(await makePill(String(index + 1), { fill: "#f3f2ef", color: "#111111" }));
    row.appendChild(await makeText(rec, { size: 13, color: "#333333", width: 528, lineHeight: 18 }));
    recommendations.appendChild(row);
  }

  bottom.appendChild(states);
  bottom.appendChild(recommendations);
  report.appendChild(bottom);

  const footer = makeFrame("Footer", { width: 1224, fill: "#ffffff", stroke: false, radius: 0, layout: "HORIZONTAL", padding: 0, gap: 0 });
  footer.primaryAxisAlignItems = "SPACE_BETWEEN";
  footer.appendChild(await makeText("Generated by Meyar Clarity", { size: 11, color: "#666666" }));
  footer.appendChild(await makeText("Review assists critique and handoff; validate with product context.", { size: 11, color: "#888888", width: 420 }));
  report.appendChild(footer);

  report.x = figma.viewport.center.x - 640;
  report.y = figma.viewport.center.y - 450;
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

  if (message.type === "clear-selection") {
    figma.currentPage.selection = [];
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


