/*
 * Daintta certificate generator
 * ---------------------------------
 * Overlays a learner's details onto the blank certificate template.
 *
 * Browser: load these before this file
 *   <script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"></script>
 * then call  DaintaCert.generate({...})  -> { bytes, certId, values }
 *
 * Node: const DaintaCert = require('./certificate.js');
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'), require('@pdf-lib/fontkit'));
  } else {
    root.DaintaCert = factory(root.PDFLib, root.fontkit);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, fontkit) {
  const { PDFDocument, rgb, setCharacterSpacing } = PDFLib;

  // Asset paths (relative to the web app root). Override via generate({ assets }).
  const DEFAULT_ASSETS = {
    template: 'assets/certs/certificate-template.pdf',
    logo: 'assets/img/logo-daintta-white.png',
    fonts: {
      Regular:  'assets/fonts/IBMPlexSans-Regular.ttf',
      Medium:   'assets/fonts/IBMPlexSans-Medium.ttf',
      SemiBold: 'assets/fonts/IBMPlexSans-SemiBold.ttf',
      Bold:     'assets/fonts/IBMPlexSans-Bold.ttf',
    },
  };

  // Positions measured from the approved certificate artwork.
  // Units: PDF points on A4 landscape (841.89 x 595.28), origin bottom-left.
  // x = left edge of text, y = text baseline, maxWidth = space before the artwork/divider.
  const NAVY = '#0A1628';
  const LAYOUT = {
    name:    { x: 205.0, y: 410.8, size: 28.0,  tracking: -0.29, minSize: 18, font: 'SemiBold', color: NAVY,      maxWidth: 280 },
    email:   { x: 205.0, y: 389.3, size: 9.95,  tracking: 0.70,  minSize: 7,  font: 'Regular',  color: '#4B586D', maxWidth: 270 },
    module:  { x: 206.1, y: 320.8, size: 18.65, tracking: -0.21, minSize: 12, font: 'SemiBold',    color: NAVY,      maxWidth: 335 },
    date:    { x: 206.1, y: 53.0,  size: 10.8,  tracking: 0.50,  minSize: 7,  font: 'SemiBold', color: NAVY,      maxWidth: 130 },
    score:   { x: 370.4, y: 53.0,  size: 10.8,  tracking: 0.50,  minSize: 7,  font: 'SemiBold', color: NAVY,      maxWidth: 130 },
    certId:  { x: 522.3, y: 53.0,  size: 10.8,  tracking: 0.50,  minSize: 7,  font: 'SemiBold', color: NAVY,      maxWidth: 135 },
    version: { x: 696.2, y: 53.0,  size: 10.8,  tracking: 0.50,  minSize: 7,  font: 'SemiBold', color: NAVY,      maxWidth: 130 },
  };

  // Logo drawn over the logo already printed in the template artwork (top-left of the navy panel).
  // The cover box is filled with the panel colour so the old logo is hidden.
  // Units: PDF points, origin bottom-left.
  const PANEL_NAVY = '#061E3B';
  const LOGO_LAYOUT = {
    cover: { x: 15.8, y: 536.0, w: 128.8, h: 35.6 },
    image: { x: 20.3, y: 540.7, w: 119.7, h: 26.2 },
  };

  function hex(c) {
    const n = parseInt(c.replace('#', ''), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function formatDate(d) {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Unambiguous alphabet: no 0/O, 1/I/L
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function randomBlock(n) {
    const bytes = new Uint8Array(n);
    (globalThis.crypto || require('crypto').webcrypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  }
  function makeCertId(moduleNumber, prefix = 'CERT') {
    return `${prefix}-M${String(moduleNumber).padStart(2, '00')}-${randomBlock(4)}-${randomBlock(4)}`;
  }
  const pad2 = (n) => String(n).padStart(2, '0');

  async function load(src) {
    if (src instanceof Uint8Array || src instanceof ArrayBuffer) return src;
    if (typeof window === 'undefined') return require('fs').readFileSync(src);
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Could not load ${src} (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Letter-spacing (tracking, in points) is applied with the PDF Tc operator.
  function textWidth(font, text, size, tracking) {
    return font.widthOfTextAtSize(text, size) + tracking * (text.length - 1);
  }

  function drawField(page, font, spec, text) {
    if (!text) return;
    let size = spec.size;
    const tr = (s) => (spec.tracking || 0) * (s / spec.size); // tracking scales with size
    while (textWidth(font, text, size, tr(size)) > spec.maxWidth && size > spec.minSize) size -= 0.25;
    page.pushOperators(setCharacterSpacing(tr(size)));
    page.drawText(text, { x: spec.x, y: spec.y, size, font, color: hex(spec.color) });
    page.pushOperators(setCharacterSpacing(0));
  }

  async function openTemplate(templateSrc, assets) {
    const pdf = await PDFDocument.load(await load(templateSrc));
    pdf.registerFontkit(fontkit);
    const fonts = {};
    for (const [w, src] of Object.entries(Object.assign({}, DEFAULT_ASSETS.fonts, assets.fonts))) {
      fonts[w] = await pdf.embedFont(await load(src), { subset: true });
    }
    const page = pdf.getPage(0);
    await drawLogo(pdf, page, assets.logo);
    return { pdf, fonts, page };
  }

  async function drawLogo(pdf, page, logoSrc) {
    const logo = await pdf.embedPng(await load(logoSrc));
    const { cover, image } = LOGO_LAYOUT;
    page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: hex(PANEL_NAVY) });
    page.drawImage(logo, { x: image.x, y: image.y, width: image.w, height: image.h });
  }

  function setMeta(pdf, heading, name, certId) {
    pdf.setTitle(`Certificate – ${heading} – ${name}`);
    pdf.setAuthor('Daintta Learning');
    pdf.setSubject(`Certificate ID ${certId}`);
  }

  /*
   * The artwork has course wording printed into it (header, side panel, the line above the module,
   * and the pass mark). Cover that wording, then redraw it from the course settings.
   * Coordinates are measured from certificate-template.png (PDF points).
   */
  const WHITE = "#FFFFFF";
  const COVERS = [
    { x: 198, y: 544, w: 140, h: 20, color: WHITE },        // "Course title" header
    { x: 20, y: 128, w: 102, h: 36, color: PANEL_NAVY },     // side-panel programme label
    { x: 198, y: 297, w: 270, h: 17, color: WHITE },        // "course label" line
    { x: 368, y: 25, w: 96, h: 13, color: WHITE },          // "(PASS MARK 80%)"
  ];
  function coverTemplateText(page, fonts, data) {
    for (const c of COVERS) page.drawRectangle({ x: c.x, y: c.y, width: c.w, height: c.h, color: hex(c.color) });
    drawField(page, fonts.SemiBold, { x: 205.0, y: 550.5, size: 11.5, tracking: 0.2, minSize: 8, font: "SemiBold", color: NAVY, maxWidth: 300 }, data.organisation);
    drawField(page, fonts.SemiBold, { x: 205.5, y: 302.0, size: 10.5, tracking: 2.2, minSize: 7, font: "SemiBold", color: "#566177", maxWidth: 360 }, (data.courseLabel || "").toUpperCase());
    drawField(page, fonts.SemiBold, { x: 370.4, y: 29.4, size: 7.14, tracking: 0.92, minSize: 6, font: "SemiBold", color: "#566177", maxWidth: 135 }, data.passMark ? `(PASS MARK ${Math.round(data.passMark)}%)` : "");
  }

  /**
   * Certificate for one module, or for the whole programme when data.heading is given.
   * data = { name, email, moduleNumber?, moduleTitle?, heading?, score, dateAwarded, certId?, contentVersion, certPrefix?,
   *          organisation?, courseLabel?, passMark? }
   */
  async function generate(data, opts = {}) {
    const assets = Object.assign({}, DEFAULT_ASSETS, opts.assets || {});
    const { pdf, fonts, page } = await openTemplate(assets.template, assets);
    const n = Number(data.moduleNumber);
    const values = {
      name: data.name,
      email: data.email,
      module: data.heading || `Module ${pad2(n)}: ${data.moduleTitle || ""}`,
      date: formatDate(data.dateAwarded || new Date()),
      score: `${Math.round(data.score)}%`,
      certId: data.certId || makeCertId(n, data.certPrefix || "CERT"),
      version: String(data.contentVersion || "1.0"),
    };
    coverTemplateText(page, fonts, data);
    for (const [key, spec] of Object.entries(LAYOUT)) drawField(page, fonts[spec.font], spec, values[key]);
    setMeta(pdf, values.module, data.name, values.certId);
    return { bytes: await pdf.save(), certId: values.certId, values };
  }

  return { generate, makeCertId, formatDate, LAYOUT };
});
