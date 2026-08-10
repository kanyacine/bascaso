"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ClockCounterClockwise, CopySimple, DotsThree, Plus, TrashSimple, Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { uploadAsset } from "./upload-asset";
import { assetsForShot } from "@/lib/hooks/use-editor-images";
import { getCanvasDimensions } from "@/lib/screenshot-editor/devices";
import { ASC_MAX_SCREENSHOTS_PER_SET } from "@/lib/screenshot-editor/export";
import { renderScreenshotToCanvas } from "@/lib/screenshot-editor/render/compose";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type {
  EditorScreenshot, LaurelVariant, RenderImage, ScreenshotDoc,
} from "@/lib/screenshot-editor/types";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

function StripItem({ id, index, doc, dispatch, onReplaceImage, canvasRef }: {
  id: string; index: number; doc: ScreenshotDoc;
  dispatch: (a: EditorAction) => void; onReplaceImage: (index: number) => void;
  canvasRef: (el: HTMLCanvasElement | null) => void;
}) {
  const t = useTranslations();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // ponytail: no drop animation. The sortable ids are positional and the list is rebuilt from the
  // doc on every dispatch, so after the reorder dnd-kit no longer recognises the dragged node and
  // animates it back to its origin before the new order paints. Stable per-screenshot ids would
  // let the animation work – that means adding an id to the persisted doc schema plus a backfill.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, animateLayoutChanges: () => false });
  const dims = getCanvasDimensions(doc);
  const selected = index === doc.selectedIndex;
  return (
    <div ref={setNodeRef}
         style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
         className="group relative">
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => dispatch({ type: "select-screenshot", index })}
        className={`block w-full overflow-hidden rounded-md border-2 ${selected ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}
      >
        <canvas ref={canvasRef} className="w-full bg-muted"
                style={{ aspectRatio: `${dims.width} / ${dims.height}` }} />
      </button>
      {/* Opacity, not `hidden`: a display:none trigger has a zero rect, which parks the open
          dropdown in the window corner instead of anchoring it to the button. */}
      <div className="pointer-events-none absolute -right-1 -top-1 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100">
        <Button size="icon" variant="secondary" className="size-6"
                aria-label={t("screenshotEditor.duplicate")}
                onClick={() => dispatch({ type: "duplicate-screenshot", index })}>
          <CopySimple size={12} />
        </Button>
        <Button size="icon" variant="secondary" className="size-6"
                aria-label={t("screenshotEditor.delete")}
                onClick={() => dispatch({ type: "remove-screenshot", index })}>
          <TrashSimple size={12} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="secondary" className="size-6"
                    aria-label={t("screenshotEditor.applyStyleToAll")}>
              <DotsThree size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setConfirmOpen(true)}
                              disabled={doc.screenshots.length < 2}>
              {t("screenshotEditor.applyStyleToAll")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === doc.selectedIndex}
                              onSelect={() => {
                                dispatch({ type: "transfer-style", from: doc.selectedIndex, to: index });
                                toast.success(t("screenshotEditor.styleApplied"));
                              }}>
              {t("screenshotEditor.copyStyleFromSelected")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReplaceImage(index)}>
              {t("screenshotEditor.replaceImage")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("screenshotEditor.applyStyleToAllTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("screenshotEditor.applyStyleToAllBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                dispatch({ type: "apply-style-to-all", from: index });
                toast.success(t("screenshotEditor.styleApplied"));
              }}>
                {t("screenshotEditor.apply")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

const THUMB_WIDTH = 224; // 112 CSS px at 2x

export function ScreenshotStrip({
  appId, doc, dispatch, images, laurelImages, fontsVersion, mockup, onVersions,
}: {
  appId: string; doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; images: Map<string, RenderImage>;
  laurelImages: Partial<Record<LaurelVariant, RenderImage>>;
  fontsVersion: number; mockup: RenderImage | null;
  onVersions: () => void;
}) {
  const t = useTranslations();
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);
  const drawn = useRef<EditorScreenshot[]>([]);
  const shots = doc.screenshots;

  // Thumbnails run the real compose pipeline so they track every edit, blitted down through a
  // single shared scratch canvas.
  const drawThumbnails = useCallback(() => {
    const scratch = document.createElement("canvas");
    const dims = getCanvasDimensions(doc);
    const height = Math.round((THUMB_WIDTH * dims.height) / dims.width);
    doc.screenshots.forEach((_, i) => {
      const thumb = thumbs.current[i];
      if (!thumb) return;
      renderScreenshotToCanvas(
        scratch, doc, i,
        { ...assetsForShot(doc, i, images, laurelImages), mockup: i === doc.selectedIndex ? mockup : null },
        {
          language: doc.currentLanguage,
          projectLanguages: doc.projectLanguages,
          createCanvas: (w, h) => {
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            return c;
          },
        },
      );
      thumb.width = THUMB_WIDTH;
      thumb.height = height;
      thumb.getContext("2d")?.drawImage(scratch, 0, 0, THUMB_WIDTH, height);
    });
    drawn.current = doc.screenshots;
  }, [doc, images, laurelImages, mockup]);

  // A drag-reorder (or an add/remove) shuffles existing screenshot objects between slots, so every
  // moved thumbnail is left showing its previous occupant's render. The canvases are keyed by
  // position, so React does not move them – repaint before the browser paints, or the old order
  // flashes. An edit replaces one object in place instead, which is what the debounce below is for.
  const shuffled = shots.length !== drawn.current.length
    || shots.some((s, i) => s !== drawn.current[i] && shots.includes(drawn.current[i]));

  useLayoutEffect(() => {
    if (shuffled) drawThumbnails();
  }, [shuffled, drawThumbnails]);

  // One full-resolution compose per screenshot is too much to pay on every frame of a slider drag.
  useEffect(() => {
    const timer = setTimeout(drawThumbnails, 200);
    return () => clearTimeout(timer);
  }, [drawThumbnails, fontsVersion]);

  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const pendingReplace = useRef<number | null>(null);
  // Positional sortable ids – the list is rebuilt from the doc on every dispatch.
  const ids = doc.screenshots.map((_, i) => `shot-${i}`);
  const [uploading, setUploading] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    dispatch({
      type: "reorder-screenshots",
      from: ids.indexOf(String(active.id)),
      to: ids.indexOf(String(over.id)),
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const name = await uploadAsset(appId, file);
        dispatch({ type: "add-screenshot", imageRef: name });
      }
    } catch {
      toast.error(t("screenshotEditor.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // Replacing an image writes it under the current working language only – the other
  // languages keep falling back through resolveScreenshotImage.
  const onReplaceImage = (index: number) => {
    pendingReplace.current = index;
    replaceInput.current?.click();
  };

  const onReplaceFile = async (files: FileList | null) => {
    const file = files?.[0];
    const index = pendingReplace.current;
    pendingReplace.current = null;
    if (!file || index === null) return;
    try {
      const name = await uploadAsset(appId, file);
      dispatch({ type: "set-screenshot-image", index, language: doc.currentLanguage, imageRef: name });
    } catch {
      toast.error(t("screenshotEditor.uploadFailed"));
    } finally {
      if (replaceInput.current) replaceInput.current.value = "";
    }
  };

  const count = doc.screenshots.length;

  return (
    <div className="flex min-h-0 w-36 flex-1 shrink-0 flex-col gap-2">
      <Button variant="outline" size="sm" className="justify-start" onClick={onVersions}>
        <ClockCounterClockwise size={14} className="mr-1.5" />{t("screenshotEditor.versions")}
      </Button>
      {count > ASC_MAX_SCREENSHOTS_PER_SET ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="flex items-center gap-1 px-1 text-xs text-destructive">
              <Warning size={12} weight="fill" />
              {t("screenshots.screenshotCountPlural", { count })}
            </p>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{t("screenshotEditor.tooManyScreenshots")}</TooltipContent>
        </Tooltip>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          {count === 1
            ? t("screenshots.screenshotCount", { count })
            : t("screenshots.screenshotCountPlural", { count })}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 py-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {doc.screenshots.map((_, index) => (
              <StripItem key={ids[index]} id={ids[index]} index={index} doc={doc}
                         dispatch={dispatch} onReplaceImage={onReplaceImage}
                         canvasRef={(el) => { thumbs.current[index] = el; }} />
            ))}
          </SortableContext>
        </DndContext>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={uploading} className="shrink-0"
                    aria-label={t("screenshotEditor.addScreenshot")}>
              <Plus size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {/* Deferred: Radix restores focus on close, which can swallow the file dialog. */}
            <DropdownMenuItem onSelect={() => setTimeout(() => fileInput.current?.click(), 0)}>
              {t("screenshotEditor.addFromImage")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dispatch({ type: "add-screenshot" })}>
              {t("screenshotEditor.addBlank")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input ref={fileInput} type="file" accept={ACCEPTED_TYPES} multiple hidden
             onChange={(e) => onFiles(e.target.files)} />
      <input ref={replaceInput} type="file" accept={ACCEPTED_TYPES} hidden
             onChange={(e) => onReplaceFile(e.target.files)} />
    </div>
  );
}
