import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import jsPDF from "jspdf";
import {
  FilePlus, FolderOpen, Save, Printer, FileDown, ImageDown,
  Image as ImageIcon, ImagePlus, ImageOff, Palette, Plus,
  MousePointer2, Pencil, Eraser, Type, Minus, MoreHorizontal,
  ArrowRight, ArrowLeftRight, Square, Circle, RotateCw,
  FlipHorizontal, FlipVertical, Group, Ungroup, BringToFront,
  SendToBack, ChevronUp, ChevronDown, Lock, Unlock, Trash2,
  Copy, Pencil as PencilEdit, Eraser as ClearIcon, Info, Box,
} from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";

type Theme = {
  name: string;
  bg: string;
  fg: string;
  pattern?: "grid" | "lines" | "chalk" | null;
};

const BUILTIN_THEMES: Theme[] = [
  { name: "themeLight", bg: "#ffffff", fg: "#111827", pattern: null },
  { name: "themeDark", bg: "#0f172a", fg: "#f8fafc", pattern: null },
  { name: "themeChalk", bg: "#1f3a2b", fg: "#f5f5dc", pattern: "chalk" },
  { name: "themeGrid", bg: "#fafaf5", fg: "#111827", pattern: "grid" },
  { name: "themePaper", bg: "#fdf6e3", fg: "#3b2f1e", pattern: "lines" },
];

type WorksheetInfo = { title: string; description: string; keywords: string };
type WorksheetData = {
  id: string;
  name: string;
  json: any;
  info: WorksheetInfo;
  themeIndex: number;
  bgImage?: string | null;
};

type Tool =
  | "select"
  | "pen"
  | "eraser"
  | "text"
  | "line"
  | "dashed"
  | "arrow"
  | "darrow"
  | "rect"
  | "ellipse";

const CANVAS_W = 1600;
const CANVAS_H = 900;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makePatternBg(theme: Theme): string {
  if (theme.pattern === "grid") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='${theme.bg}'/><path d='M40 0H0V40' fill='none' stroke='#c7d2fe' stroke-width='1'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }
  if (theme.pattern === "lines") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='${theme.bg}'/><path d='M0 39H40' stroke='#d6c9a8' stroke-width='1'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }
  if (theme.pattern === "chalk") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><rect width='60' height='60' fill='${theme.bg}'/><circle cx='10' cy='20' r='0.5' fill='#ffffff22'/><circle cx='45' cy='40' r='0.5' fill='#ffffff22'/><circle cx='30' cy='10' r='0.4' fill='#ffffff22'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }
  return theme.bg;
}

export default function Whiteboard() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  const [lang, setLang] = useState<Lang>("lv");
  const t = translations[lang];

  const [themes, setThemes] = useState<Theme[]>(BUILTIN_THEMES);
  const [themeIndex, setThemeIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#111827");
  const [thickness, setThickness] = useState(3);
  const [fontSize, setFontSize] = useState(28);
  const [opacity, setOpacity] = useState(100);
  const [dashed, setDashed] = useState(false);

  const [worksheets, setWorksheets] = useState<WorksheetData[]>([
    {
      id: uid(),
      name: `${translations.lv.worksheet} 1`,
      json: null,
      info: { title: "", description: "", keywords: "" },
      themeIndex: 0,
      bgImage: null,
    },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [hasSelection, setHasSelection] = useState(false);
  const [isTextSelected, setIsTextSelected] = useState(false);
  const [show3D, setShow3D] = useState(false);


  // Initialize fabric
  useEffect(() => {
    if (!canvasElRef.current) return;
    const c = new fabric.Canvas(canvasElRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: BUILTIN_THEMES[0].bg,
      preserveObjectStacking: true,
    });
    fabricRef.current = c;

    const resize = () => {
      if (!wrapperRef.current || !fabricRef.current) return;
      const w = wrapperRef.current.clientWidth;
      const h = wrapperRef.current.clientHeight;
      const scale = Math.min(w / CANVAS_W, h / CANVAS_H);
      const el = c.getElement().parentElement as HTMLElement | null;
      if (el) {
        el.style.transform = `scale(${scale})`;
        el.style.transformOrigin = "top left";
        el.style.position = "absolute";
        el.style.left = `${(w - CANVAS_W * scale) / 2}px`;
        el.style.top = `${(h - CANVAS_H * scale) / 2}px`;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    const onSel = () => {
      const active = c.getActiveObjects();
      setHasSelection(active.length > 0);
      const text = active.find(
        (o) => o instanceof fabric.IText || o instanceof fabric.Textbox || o instanceof fabric.Text
      ) as (fabric.IText | fabric.Textbox | fabric.Text) | undefined;
      if (text) {
        setIsTextSelected(true);
        setFontSize(text.fontSize || 28);
      } else {
        setIsTextSelected(false);
      }
    };
    const onClr = () => {
      setHasSelection(false);
      setIsTextSelected(false);
    };

    c.on("selection:created", onSel);
    c.on("selection:updated", onSel);
    c.on("selection:cleared", onClr);

    return () => {
      window.removeEventListener("resize", resize);
      c.off("selection:created", onSel);
      c.off("selection:updated", onSel);
      c.off("selection:cleared", onClr);
      c.dispose();
    };
  }, []);

  const applyTheme = useCallback((idx: number) => {
    const c = fabricRef.current;
    if (!c) return;
    const theme = themes[idx];
    if (!theme) return;
    c.backgroundColor = theme.bg;
    // Pattern via CSS behind canvas
    const el = c.getElement();
    el.style.backgroundImage = theme.pattern ? makePatternBg(theme) : "none";
    el.style.backgroundColor = theme.bg;
    c.requestRenderAll();
  }, [themes]);

  useEffect(() => {
    applyTheme(themeIndex);
  }, [themeIndex, applyTheme]);

  // Tool switching
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    c.isDrawingMode = tool === "pen" || tool === "eraser";
    if (c.isDrawingMode) {
      const brush = new fabric.PencilBrush(c);
      brush.color = tool === "eraser" ? themes[themeIndex].bg : color;
      brush.width = tool === "eraser" ? thickness * 4 : thickness;
      c.freeDrawingBrush = brush;
    }
    c.selection = tool === "select";
    c.forEachObject((o) => {
      o.selectable = tool === "select" && !o.lockMovementX;
    });
  }, [tool, color, thickness, themeIndex, themes]);

  // Shape/text placement
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    let isDown = false;
    let start: { x: number; y: number } | null = null;
    let shape: fabric.Object | null = null;

    const onDown = (opt: any) => {
      if (!["line", "dashed", "arrow", "darrow", "rect", "ellipse", "text"].includes(tool)) return;
      const p = c.getScenePoint(opt.e);
      start = { x: p.x, y: p.y };

      if (tool === "text") {
        const it = new fabric.IText("Text", {
          left: p.x,
          top: p.y,
          fill: color,
          fontSize,
          fontFamily: "Inter, Arial, sans-serif",
          opacity: opacity / 100,
        });
        c.add(it);
        c.setActiveObject(it);
        it.enterEditing();
        it.selectAll();
        setTool("select");
        return;
      }

      isDown = true;
      const strokeDash = tool === "dashed" ? [thickness * 4, thickness * 3] : undefined;

      if (tool === "rect") {
        shape = new fabric.Rect({
          left: p.x, top: p.y, width: 1, height: 1,
          fill: "transparent", stroke: color, strokeWidth: thickness,
          strokeDashArray: strokeDash, opacity: opacity / 100,
        });
      } else if (tool === "ellipse") {
        shape = new fabric.Ellipse({
          left: p.x, top: p.y, rx: 1, ry: 1,
          fill: "transparent", stroke: color, strokeWidth: thickness,
          strokeDashArray: strokeDash, opacity: opacity / 100,
        });
      } else {
        shape = new fabric.Line([p.x, p.y, p.x, p.y], {
          stroke: color, strokeWidth: thickness,
          strokeDashArray: strokeDash, opacity: opacity / 100,
        });
        (shape as any)._arrowMode = tool === "arrow" ? "one" : tool === "darrow" ? "two" : "none";
      }
      c.add(shape);
    };

    const onMove = (opt: any) => {
      if (!isDown || !shape || !start) return;
      const p = c.getScenePoint(opt.e);
      if (shape instanceof fabric.Rect) {
        shape.set({
          left: Math.min(p.x, start.x),
          top: Math.min(p.y, start.y),
          width: Math.abs(p.x - start.x),
          height: Math.abs(p.y - start.y),
        });
      } else if (shape instanceof fabric.Ellipse) {
        const rx = Math.abs(p.x - start.x) / 2;
        const ry = Math.abs(p.y - start.y) / 2;
        shape.set({
          left: Math.min(p.x, start.x),
          top: Math.min(p.y, start.y),
          rx, ry,
        });
      } else if (shape instanceof fabric.Line) {
        shape.set({ x2: p.x, y2: p.y });
      }
      c.requestRenderAll();
    };

    const onUp = () => {
      if (shape instanceof fabric.Line && (shape as any)._arrowMode !== "none") {
        // Convert to group with arrowheads
        const line = shape;
        const mode = (line as any)._arrowMode;
        const x1 = line.x1!, y1 = line.y1!, x2 = line.x2!, y2 = line.y2!;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const size = thickness * 4 + 6;
        const makeHead = (x: number, y: number, a: number) => {
          const pts = [
            { x: 0, y: 0 },
            { x: -size, y: -size / 2 },
            { x: -size, y: size / 2 },
          ];
          return new fabric.Polygon(pts, {
            left: x, top: y, fill: color, originX: "center", originY: "center",
            angle: (a * 180) / Math.PI,
          });
        };
        const parts: fabric.Object[] = [line];
        if (mode === "one" || mode === "two") parts.push(makeHead(x2, y2, angle));
        if (mode === "two") parts.push(makeHead(x1, y1, angle + Math.PI));
        c.remove(line);
        const g = new fabric.Group(parts, { opacity: opacity / 100 });
        c.add(g);
      }
      isDown = false;
      shape = null;
      start = null;
      if (tool !== "pen" && tool !== "eraser" && tool !== "select") {
        // stay on tool
      }
    };

    c.on("mouse:down", onDown);
    c.on("mouse:move", onMove);
    c.on("mouse:up", onUp);
    return () => {
      c.off("mouse:down", onDown);
      c.off("mouse:move", onMove);
      c.off("mouse:up", onUp);
    };
  }, [tool, color, thickness, fontSize, opacity]);

  // Worksheet switching: save current, load new
  const saveActiveToState = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    setWorksheets((ws) => {
      const copy = [...ws];
      if (copy[activeIdx]) {
        copy[activeIdx] = {
          ...copy[activeIdx],
          json: c.toJSON(),
          themeIndex,
        };
      }
      return copy;
    });
  }, [activeIdx, themeIndex]);

  const switchWorksheet = useCallback(
    async (idx: number) => {
      const c = fabricRef.current;
      if (!c || idx === activeIdx) return;
      saveActiveToState();
      const target = worksheets[idx];
      if (!target) return;
      setActiveIdx(idx);
      setThemeIndex(target.themeIndex);
      if (target.json) {
        await c.loadFromJSON(target.json);
        c.requestRenderAll();
      } else {
        c.clear();
        applyTheme(target.themeIndex);
      }
    },
    [activeIdx, worksheets, saveActiveToState, applyTheme]
  );

  const addWorksheet = () => {
    saveActiveToState();
    const c = fabricRef.current;
    if (!c) return;
    const newWs: WorksheetData = {
      id: uid(),
      name: `${t.worksheet} ${worksheets.length + 1}`,
      json: null,
      info: { title: "", description: "", keywords: "" },
      themeIndex,
    };
    setWorksheets((ws) => [...ws, newWs]);
    setActiveIdx(worksheets.length);
    c.clear();
    applyTheme(themeIndex);
  };

  const duplicateWorksheet = () => {
    saveActiveToState();
    const c = fabricRef.current;
    if (!c) return;
    const json = c.toJSON();
    const cur = worksheets[activeIdx];
    const newWs: WorksheetData = {
      id: uid(),
      name: `${cur.name} (copy)`,
      json,
      info: { ...cur.info },
      themeIndex,
    };
    setWorksheets((ws) => {
      const copy = [...ws];
      copy.splice(activeIdx + 1, 0, newWs);
      return copy;
    });
    setActiveIdx(activeIdx + 1);
  };

  const deleteWorksheet = () => {
    if (worksheets.length <= 1) return;
    const newList = worksheets.filter((_, i) => i !== activeIdx);
    setWorksheets(newList);
    const newIdx = Math.max(0, activeIdx - 1);
    setActiveIdx(newIdx);
    const c = fabricRef.current;
    if (c && newList[newIdx]?.json) {
      c.loadFromJSON(newList[newIdx].json).then(() => c.requestRenderAll());
    } else if (c) {
      c.clear();
    }
  };

  const clearWorksheet = () => {
    const c = fabricRef.current;
    if (!c) return;
    c.clear();
    applyTheme(themeIndex);
  };

  const renameWorksheet = () => {
    const name = prompt(t.rename, worksheets[activeIdx].name);
    if (!name) return;
    setWorksheets((ws) => {
      const copy = [...ws];
      copy[activeIdx] = { ...copy[activeIdx], name };
      return copy;
    });
  };

  // File operations
  const handleNew = () => {
    if (!confirm(t.new + "?")) return;
    const c = fabricRef.current;
    if (!c) return;
    c.clear();
    setWorksheets([
      { id: uid(), name: `${t.worksheet} 1`, json: null, info: { title: "", description: "", keywords: "" }, themeIndex: 0 },
    ]);
    setActiveIdx(0);
    setThemeIndex(0);
    setFileName("");
  };

  const handleSave = () => {
    saveActiveToState();
    const c = fabricRef.current;
    if (!c) return;
    // Ensure current json included
    const wsSnapshot = worksheets.map((w, i) =>
      i === activeIdx ? { ...w, json: c.toJSON(), themeIndex } : w
    );
    const data = {
      version: 1,
      themes,
      worksheets: wsSnapshot,
    };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (fileName || "whiteboard") + ".wbd.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpen = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.themes) setThemes(data.themes);
        if (data.worksheets) {
          setWorksheets(data.worksheets);
          setActiveIdx(0);
          const c = fabricRef.current;
          if (c && data.worksheets[0]?.json) {
            await c.loadFromJSON(data.worksheets[0].json);
            setThemeIndex(data.worksheets[0].themeIndex ?? 0);
            c.requestRenderAll();
          }
        }
        setFileName(file.name.replace(/\.wbd\.json$/, ""));
      } catch (e) {
        alert("Failed to open file");
      }
    };
    reader.readAsText(file);
  };

  const handleImportImage = (file: File, asBackground = false) => {
    const c = fabricRef.current;
    if (!c) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      if (file.type === "application/pdf") {
        alert("PDF: import as image after external conversion, or use JPG/PNG for now.");
        return;
      }
      const img = await fabric.FabricImage.fromURL(url);
      if (asBackground) {
        img.set({
          scaleX: CANVAS_W / img.width!,
          scaleY: CANVAS_H / img.height!,
          selectable: false,
          evented: false,
        });
        c.backgroundImage = img;
        c.requestRenderAll();
      } else {
        img.scaleToWidth(400);
        img.set({ left: 100, top: 100 });
        c.add(img);
      }
    };
    reader.readAsDataURL(file);
  };

  const exportJPG = () => {
    const c = fabricRef.current;
    if (!c) return;
    const url = c.toDataURL({ format: "jpeg", quality: 0.92, multiplier: 1 });
    const a = document.createElement("a");
    a.href = url;
    a.download = (worksheets[activeIdx].name || "worksheet") + ".jpg";
    a.click();
  };

  const exportPDF = () => {
    saveActiveToState();
    const c = fabricRef.current;
    if (!c) return;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [CANVAS_W, CANVAS_H] });
    // Iterate worksheets: render each
    (async () => {
      for (let i = 0; i < worksheets.length; i++) {
        const w = i === activeIdx ? { ...worksheets[i], json: c.toJSON(), themeIndex } : worksheets[i];
        if (w.json) {
          await c.loadFromJSON(w.json);
        } else {
          c.clear();
        }
        applyTheme(w.themeIndex);
        c.renderAll();
        const dataUrl = c.toDataURL({ format: "jpeg", quality: 0.9, multiplier: 1 });
        if (i > 0) pdf.addPage([CANVAS_W, CANVAS_H], "landscape");
        pdf.addImage(dataUrl, "JPEG", 0, 0, CANVAS_W, CANVAS_H);
      }
      pdf.setProperties({
        title: worksheets[activeIdx].info.title || fileName || "Whiteboard",
        subject: worksheets[activeIdx].info.description,
        keywords: worksheets[activeIdx].info.keywords,
      });
      pdf.save((fileName || "whiteboard") + ".pdf");
      // Restore active
      const active = worksheets[activeIdx];
      if (active.json) await c.loadFromJSON(active.json);
      applyTheme(themeIndex);
      c.requestRenderAll();
    })();
  };

  const handlePrint = () => {
    const c = fabricRef.current;
    if (!c) return;
    const url = c.toDataURL({ format: "png", multiplier: 2 });
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Print</title></head><body style="margin:0"><img src="${url}" style="width:100%"/><script>window.onload=()=>window.print();</script></body></html>`);
    w.document.close();
  };

  // Object operations
  const withActive = (fn: (obj: fabric.Object, c: fabric.Canvas) => void) => {
    const c = fabricRef.current;
    if (!c) return;
    const obj = c.getActiveObject();
    if (!obj) return;
    fn(obj, c);
    c.requestRenderAll();
  };

  const rotate = () => withActive((o) => o.set({ angle: (o.angle || 0) + 15 }));
  const flipH = () => withActive((o) => o.set({ flipX: !o.flipX }));
  const flipV = () => withActive((o) => o.set({ flipY: !o.flipY }));
  const bringFront = () => withActive((o, c) => c.bringObjectToFront(o));
  const sendBack = () => withActive((o, c) => c.sendObjectToBack(o));
  const forward = () => withActive((o, c) => c.bringObjectForward(o));
  const backward = () => withActive((o, c) => c.sendObjectBackwards(o));
  const lock = () =>
    withActive((o) =>
      o.set({
        lockMovementX: true, lockMovementY: true, lockScalingX: true,
        lockScalingY: true, lockRotation: true, selectable: false,
      })
    );
  const unlockAll = () => {
    const c = fabricRef.current;
    if (!c) return;
    c.forEachObject((o) => {
      o.set({
        lockMovementX: false, lockMovementY: false, lockScalingX: false,
        lockScalingY: false, lockRotation: false, selectable: true,
      });
    });
    c.requestRenderAll();
  };
  const groupSel = () => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (active instanceof fabric.ActiveSelection) {
      const g = new fabric.Group(active.removeAll() as fabric.Object[]);
      c.add(g);
      c.setActiveObject(g);
      c.requestRenderAll();
    }
  };
  const ungroupSel = () => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (active instanceof fabric.Group) {
      const items = active.removeAll() as fabric.Object[];
      c.remove(active);
      items.forEach((it) => c.add(it));
      c.requestRenderAll();
    }
  };
  const deleteObj = () => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObjects();
    active.forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
  };
  const setObjOpacity = (v: number) => {
    setOpacity(v);
    withActive((o) => o.set({ opacity: v / 100 }));
  };

  // Apply style patch recursively (handles groups + active-selection)
  const applyStyleToObj = (
    o: fabric.Object,
    patch: { color?: string; thickness?: number; dashed?: boolean; fontSize?: number }
  ) => {

    if (o instanceof fabric.Group) {
      o.getObjects().forEach((child) => applyStyleToObj(child, patch));
      o.dirty = true;
      return;
    }
    if (patch.color !== undefined) {
      if (
        o instanceof fabric.IText ||
        o instanceof fabric.Textbox ||
        o instanceof fabric.Text ||
        o instanceof fabric.Polygon
      ) {
        o.set({ fill: patch.color });
      }
      if ((o as any).stroke !== undefined && (o as any).stroke !== null && !(o instanceof fabric.Polygon)) {
        o.set({ stroke: patch.color });
      }
    }
    if (patch.thickness !== undefined && (o as any).strokeWidth !== undefined) {
      o.set({ strokeWidth: patch.thickness });
    }
    if (patch.dashed !== undefined && (o as any).stroke) {
      const w = (o as any).strokeWidth || 3;
      o.set({ strokeDashArray: patch.dashed ? [w * 4, w * 3] : null });
    }
    if (patch.fontSize !== undefined && (
      o instanceof fabric.IText || o instanceof fabric.Textbox || o instanceof fabric.Text
    )) {
      o.set({ fontSize: patch.fontSize });
      if (typeof (o as any).initDimensions === "function") {
        (o as any).initDimensions();
      }
    }
  };

  const applyStyleToSelected = (patch: { color?: string; thickness?: number; dashed?: boolean; fontSize?: number }) => {

    const c = fabricRef.current;
    if (!c) return false;
    const objs = c.getActiveObjects();
    if (!objs.length) return false;
    objs.forEach((o) => applyStyleToObj(o, patch));
    c.requestRenderAll();
    return true;
  };

  const handleColor = (v: string) => {
    setColor(v);
    applyStyleToSelected({ color: v });
  };
  const handleThickness = (v: number) => {
    setThickness(v);
    applyStyleToSelected({ thickness: v });
  };
  const handleDashed = (v: boolean) => {
    setDashed(v);
    applyStyleToSelected({ dashed: v });
  };
  const handleFontSize = (v: number) => {
    setFontSize(v);
    applyStyleToSelected({ fontSize: v });
  };


  const duplicateObj = async () => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    const cloned = await active.clone();
    if (active instanceof fabric.ActiveSelection) {
      c.discardActiveObject();
      const grp = cloned as fabric.ActiveSelection;
      grp.canvas = c;
      grp.forEachObject((o) => {
        o.set({ left: (o.left || 0) + 20, top: (o.top || 0) + 20 });
        c.add(o);
      });
      grp.setCoords();
    } else {
      cloned.set({ left: (cloned.left || 0) + 20, top: (cloned.top || 0) + 20 });
      c.add(cloned);
      c.setActiveObject(cloned);
    }
    c.requestRenderAll();
  };


  const saveCustomTheme = () => {
    const name = prompt(t.saveTheme, "myTheme");
    if (!name) return;
    const bg = prompt(t.bgColor, "#eef2ff") || "#ffffff";
    const fg = prompt(t.color, "#111827") || "#111827";
    setThemes((th) => [...th, { name, bg, fg, pattern: null }]);
  };

  const info = worksheets[activeIdx]?.info || { title: "", description: "", keywords: "" };
  const setInfo = (partial: Partial<WorksheetInfo>) => {
    setWorksheets((ws) => {
      const copy = [...ws];
      copy[activeIdx] = { ...copy[activeIdx], info: { ...copy[activeIdx].info, ...partial } };
      return copy;
    });
  };

  // Keyboard delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const c = fabricRef.current;
        const active = c?.getActiveObject();
        if (active && !(active as any).isEditing) {
          deleteObj();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const btn = "inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs border border-border hover:bg-accent transition-colors";
  const btnIcon = "inline-flex items-center justify-center h-8 w-8 rounded border border-border hover:bg-accent transition-colors";
  const btnActive = "bg-primary text-primary-foreground border-primary hover:bg-primary/90";

  const IconBtn = ({
    onClick, title, active, children,
  }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) => (
    <button
      className={`${btnIcon} ${active ? btnActive : ""}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );

  const add3DShape = (kind: "cube" | "sphere" | "cylinder" | "pyramid" | "cone" | "cuboid") => {
    const c = fabricRef.current;
    if (!c) return;
    const stroke = color;
    const sw = thickness;
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;

    let d = "";
    if (kind === "cube") {
      const s = 160, off = 60;
      d = `M 0 ${off} L ${s} ${off} L ${s} ${s + off} L 0 ${s + off} Z ` +
          `M 0 ${off} L ${off} 0 L ${s + off} 0 L ${s} ${off} ` +
          `M ${s + off} 0 L ${s + off} ${s} L ${s} ${s + off}`;
    } else if (kind === "cuboid") {
      const w = 220, h = 140, off = 70;
      d = `M 0 ${off} L ${w} ${off} L ${w} ${h + off} L 0 ${h + off} Z ` +
          `M 0 ${off} L ${off} 0 L ${w + off} 0 L ${w} ${off} ` +
          `M ${w + off} 0 L ${w + off} ${h} L ${w} ${h + off}`;
    } else if (kind === "sphere") {
      const r = 90;
      d = `M 0 ${r} A ${r} ${r} 0 1 0 ${2 * r} ${r} A ${r} ${r} 0 1 0 0 ${r} ` +
          `M 0 ${r} A ${r} ${r * 0.28} 0 1 0 ${2 * r} ${r}`;
    } else if (kind === "cylinder") {
      const w = 160, h = 200, ry = 30;
      d = `M 0 ${ry} A ${w / 2} ${ry} 0 1 0 ${w} ${ry} A ${w / 2} ${ry} 0 1 0 0 ${ry} ` +
          `M 0 ${ry} L 0 ${ry + h} A ${w / 2} ${ry} 0 0 0 ${w} ${ry + h} L ${w} ${ry}`;
    } else if (kind === "cone") {
      const w = 180, h = 220, ry = 30;
      const apexX = w / 2;
      d = `M 0 ${h} A ${w / 2} ${ry} 0 1 0 ${w} ${h} A ${w / 2} ${ry} 0 1 0 0 ${h} ` +
          `M 0 ${h} L ${apexX} 0 L ${w} ${h}`;
    } else {
      // pyramid
      const w = 200, h = 180, off = 70;
      const apexX = (w + off) / 2;
      d = `M 0 ${h} L ${w} ${h} L ${w + off} ${h - off} L ${off} ${h - off} Z ` +
          `M 0 ${h} L ${apexX} 0 L ${w} ${h} ` +
          `M ${w + off} ${h - off} L ${apexX} 0 ` +
          `M ${off} ${h - off} L ${apexX} 0`;
    }

    const path = new fabric.Path(d, {
      fill: "",
      stroke,
      strokeWidth: sw,
      strokeLineJoin: "round",
      strokeLineCap: "round",
      left: cx - 150,
      top: cy - 150,
      opacity: opacity / 100,
    });
    c.add(path);
    c.setActiveObject(path);
    c.requestRenderAll();
    setShow3D(false);
  };


  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 flex-wrap">
        <div className="font-bold text-sm mr-2">{t.appName}</div>
        <IconBtn onClick={handleNew} title={t.new}><FilePlus size={16} /></IconBtn>
        <IconBtn onClick={() => openInputRef.current?.click()} title={t.open}><FolderOpen size={16} /></IconBtn>
        <input ref={openInputRef} type="file" accept=".json" hidden
          onChange={(e) => e.target.files?.[0] && handleOpen(e.target.files[0])} />
        <IconBtn onClick={handleSave} title={t.save}><Save size={16} /></IconBtn>
        <IconBtn onClick={handlePrint} title={t.print}><Printer size={16} /></IconBtn>
        <IconBtn onClick={exportPDF} title={t.exportPdf}><FileDown size={16} /></IconBtn>
        <IconBtn onClick={exportJPG} title={t.exportJpg}><ImageDown size={16} /></IconBtn>
        <div className="w-px h-6 bg-border mx-1" />
        <IconBtn onClick={() => fileInputRef.current?.click()} title={t.importImage}><ImagePlus size={16} /></IconBtn>
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.ppt,.pptx" hidden
          onChange={(e) => e.target.files?.[0] && handleImportImage(e.target.files[0], false)} />
        <IconBtn onClick={() => bgInputRef.current?.click()} title={t.setBackground}><ImageIcon size={16} /></IconBtn>
        <input ref={bgInputRef} type="file" accept="image/*" hidden
          onChange={(e) => e.target.files?.[0] && handleImportImage(e.target.files[0], true)} />
        <IconBtn onClick={() => { const c = fabricRef.current; if (c) { c.backgroundImage = undefined; c.requestRenderAll(); } }} title={t.clearBackground}>
          <ImageOff size={16} />
        </IconBtn>
        <div className="flex-1" />
        <Palette size={14} className="text-muted-foreground" aria-label={t.theme} />
        <select className="text-xs border border-border rounded px-1 py-1 bg-background"
          value={themeIndex} onChange={(e) => setThemeIndex(Number(e.target.value))}
          title={t.theme}>
          {themes.map((th, i) => (
            <option key={i} value={i}>{(t as any)[th.name] || th.name}</option>
          ))}
        </select>
        <IconBtn onClick={saveCustomTheme} title={t.customTheme}><Plus size={16} /></IconBtn>
        <div className="w-px h-6 bg-border mx-1" />
        <select className="text-xs border border-border rounded px-1 py-1 bg-background"
          value={lang} onChange={(e) => setLang(e.target.value as Lang)}
          title={t.language}>
          <option value="lv">LV</option>
          <option value="en">EN</option>
        </select>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left tools */}
        <div className="w-40 border-r border-border p-2 flex flex-col gap-2 overflow-auto">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t.tools}</div>
          <div className="grid grid-cols-4 gap-1">
            {([
              ["select", t.select, <MousePointer2 size={16} />],
              ["pen", t.pen, <Pencil size={16} />],
              ["eraser", t.eraser, <Eraser size={16} />],
              ["text", t.text, <Type size={16} />],
              ["line", t.line, <Minus size={16} />],
              ["dashed", t.dashedLine, <MoreHorizontal size={16} />],
              ["arrow", t.arrow, <ArrowRight size={16} />],
              ["darrow", t.doubleArrow, <ArrowLeftRight size={16} />],
              ["rect", t.rect, <Square size={16} />],
              ["ellipse", t.ellipse, <Circle size={16} />],
            ] as [Tool, string, React.ReactNode][]).map(([k, label, icon]) => (
              <button key={k} title={label} aria-label={label}
                className={`${btnIcon} ${tool === k ? btnActive : ""}`}
                onClick={() => setTool(k)}>
                {icon}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              className={`${btnIcon} w-full ${show3D ? btnActive : ""}`}
              onClick={() => setShow3D((v) => !v)}
              title={t.shapes3d}
              aria-label={t.shapes3d}
            >
              <Box size={16} />
            </button>
            {show3D && (
              <div className="absolute left-full top-0 ml-1 z-20 bg-popover text-popover-foreground border border-border rounded shadow-lg p-2 grid grid-cols-3 gap-1 w-48">
                <button className={btnIcon} title={t.cube} aria-label={t.cube} onClick={() => add3DShape("cube")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 8l4-4h9l-4 4H4zm0 0v11h13V8M17 8l4-4v11l-4 4"/></svg>
                </button>
                <button className={btnIcon} title={t.cuboid} aria-label={t.cuboid} onClick={() => add3DShape("cuboid")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 9l4-4h13l-4 4H3zm0 0v10h13V9m0 0l4-4v10l-4 4"/></svg>
                </button>
                <button className={btnIcon} title={t.sphere} aria-label={t.sphere} onClick={() => add3DShape("sphere")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3"/></svg>
                </button>
                <button className={btnIcon} title={t.cylinder} aria-label={t.cylinder} onClick={() => add3DShape("cylinder")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><ellipse cx="12" cy="5" rx="7" ry="2.5"/><path d="M5 5v14a7 2.5 0 0 0 14 0V5"/></svg>
                </button>
                <button className={btnIcon} title={t.cone} aria-label={t.cone} onClick={() => add3DShape("cone")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><ellipse cx="12" cy="19" rx="8" ry="2.5"/><path d="M4 19L12 3l8 16"/></svg>
                </button>
                <button className={btnIcon} title={t.pyramid} aria-label={t.pyramid} onClick={() => add3DShape("pyramid")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3L3 19h18L12 3zm0 0L21 19M3 19l9-6 9 6"/></svg>
                </button>
              </div>
            )}
          </div>


          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-2">
            {t.color} {hasSelection && <span className="text-primary normal-case" title={t.applyToSelection}>●</span>}
          </label>
          <input type="color" value={color} onChange={(e) => handleColor(e.target.value)} className="w-full h-8 rounded border border-border" />

          <label className="text-[10px] text-muted-foreground">{t.thickness}: {thickness}</label>
          <input type="range" min={1} max={30} value={thickness} onChange={(e) => handleThickness(Number(e.target.value))} />

          <label className="text-[10px] text-muted-foreground">{t.lineType}</label>
          <div className="grid grid-cols-2 gap-1">
            <button
              className={`${btnIcon} ${!dashed ? btnActive : ""}`}
              onClick={() => handleDashed(false)}
              title={t.solid}
              aria-label={t.solid}
            >
              <Minus size={16} />
            </button>
            <button
              className={`${btnIcon} ${dashed ? btnActive : ""}`}
              onClick={() => handleDashed(true)}
              title={t.dashed}
              aria-label={t.dashed}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>

          <label className="text-[10px] text-muted-foreground">{t.fontSize}: {fontSize} {isTextSelected && <span className="text-primary normal-case" title={t.applyToSelection}>●</span>}</label>
          <input type="range" min={10} max={120} value={fontSize} onChange={(e) => handleFontSize(Number(e.target.value))} />


          <label className="text-[10px] text-muted-foreground">{t.opacity}: {opacity}%</label>
          <input type="range" min={5} max={100} value={opacity} onChange={(e) => setObjOpacity(Number(e.target.value))} />

          <div className="border-t border-border my-2" />
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t.selection}</div>
          {isTextSelected && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t.fontSize}: {fontSize}</label>
              <input type="range" min={10} max={120} value={fontSize} onChange={(e) => handleFontSize(Number(e.target.value))} />
            </div>
          )}

          <div className="grid grid-cols-4 gap-1">
            <IconBtn onClick={duplicateObj} title={t.duplicateObj}><Copy size={16} /></IconBtn>
            <IconBtn onClick={rotate} title={t.rotate}><RotateCw size={16} /></IconBtn>
            <IconBtn onClick={flipH} title={t.flipH}><FlipHorizontal size={16} /></IconBtn>
            <IconBtn onClick={flipV} title={t.flipV}><FlipVertical size={16} /></IconBtn>
            <IconBtn onClick={groupSel} title={t.group}><Group size={16} /></IconBtn>
            <IconBtn onClick={ungroupSel} title={t.ungroup}><Ungroup size={16} /></IconBtn>
            <IconBtn onClick={bringFront} title={t.front}><BringToFront size={16} /></IconBtn>
            <IconBtn onClick={sendBack} title={t.back}><SendToBack size={16} /></IconBtn>
            <IconBtn onClick={forward} title={t.forward}><ChevronUp size={16} /></IconBtn>
            <IconBtn onClick={backward} title={t.backward}><ChevronDown size={16} /></IconBtn>
            <IconBtn onClick={lock} title={t.lock}><Lock size={16} /></IconBtn>
            <IconBtn onClick={unlockAll} title={t.unlock}><Unlock size={16} /></IconBtn>
            <IconBtn onClick={deleteObj} title={t.deleteObj}><Trash2 size={16} /></IconBtn>
          </div>
        </div>


        {/* Canvas area */}
        <div ref={wrapperRef} className="flex-1 relative overflow-hidden bg-muted">
          <div>
            <canvas ref={canvasElRef} />
          </div>
        </div>

        {/* Right: worksheets */}
        <div className="w-56 border-l border-border p-2 flex flex-col gap-2 overflow-auto">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t.worksheets}</div>
            <IconBtn onClick={() => setShowInfo((v) => !v)} title={t.info}><Info size={16} /></IconBtn>
          </div>

          {showInfo && (
            <div className="border border-border rounded p-2 flex flex-col gap-1 text-xs">
              <label className="text-[10px] text-muted-foreground">{t.title}</label>
              <input className="border border-border rounded px-1 py-0.5 bg-background"
                value={info.title} onChange={(e) => setInfo({ title: e.target.value })} />
              <label className="text-[10px] text-muted-foreground">{t.description}</label>
              <textarea className="border border-border rounded px-1 py-0.5 bg-background"
                rows={3} value={info.description} onChange={(e) => setInfo({ description: e.target.value })} />
              <label className="text-[10px] text-muted-foreground">{t.keywords}</label>
              <input className="border border-border rounded px-1 py-0.5 bg-background"
                value={info.keywords} onChange={(e) => setInfo({ keywords: e.target.value })} />
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <IconBtn onClick={addWorksheet} title={t.addWorksheet}><Plus size={16} /></IconBtn>
            <IconBtn onClick={duplicateWorksheet} title={t.duplicate}><Copy size={16} /></IconBtn>
            <IconBtn onClick={renameWorksheet} title={t.rename}><PencilEdit size={16} /></IconBtn>
            <IconBtn onClick={clearWorksheet} title={t.clear}><ClearIcon size={16} /></IconBtn>
            <IconBtn onClick={deleteWorksheet} title={t.delete}><Trash2 size={16} /></IconBtn>
          </div>

          <div className="flex flex-col gap-1 mt-1">
            {worksheets.map((w, i) => (
              <button key={w.id}
                className={`text-left text-xs px-2 py-1 rounded border ${i === activeIdx ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
                onClick={() => switchWorksheet(i)}>
                {i + 1}. {w.name}
              </button>
            ))}
          </div>

          <div className="text-[10px] text-muted-foreground mt-2 leading-tight">
            {t.installHint}
          </div>
        </div>
      </div>
    </div>
  );
}
