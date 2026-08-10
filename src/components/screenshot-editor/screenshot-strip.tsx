"use client";

import { useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CopySimple, DotsThree, Plus, TrashSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadAsset } from "./upload-asset";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

function StripItem({ id, index, doc, images, dispatch }: {
  id: string; index: number; doc: ScreenshotDoc; images: Map<string, RenderImage>;
  dispatch: (a: EditorAction) => void;
}) {
  const t = useTranslations();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const shot = doc.screenshots[index];
  const ref = shot.localizedImages[doc.currentLanguage]?.src ?? shot.src ?? null;
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
        className={`block w-24 overflow-hidden rounded-md border-2 ${selected ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}
      >
        {ref && images.get(ref) ? (
          <img src={(images.get(ref) as unknown as HTMLImageElement).src} alt="" className="aspect-[9/19.5] w-full object-cover" />
        ) : (
          <div className="aspect-[9/19.5] w-full bg-muted" />
        )}
      </button>
      <div className="absolute -right-1 -top-1 hidden gap-1 group-hover:flex">
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

export function ScreenshotStrip({ appId, doc, dispatch, images }: {
  appId: string; doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; images: Map<string, RenderImage>;
}) {
  const t = useTranslations();
  const fileInput = useRef<HTMLInputElement>(null);
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

  return (
    <div className="flex w-28 shrink-0 flex-col gap-3 overflow-y-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {doc.screenshots.map((_, index) => (
            <StripItem key={ids[index]} id={ids[index]} index={index} doc={doc} images={images}
                       dispatch={dispatch} />
          ))}
        </SortableContext>
      </DndContext>
      <Button variant="outline" size="sm" disabled={uploading}
              onClick={() => fileInput.current?.click()} aria-label={t("screenshotEditor.addScreenshot")}>
        <Plus size={14} />
      </Button>
      <input ref={fileInput} type="file" accept={ACCEPTED_TYPES} multiple hidden
             onChange={(e) => onFiles(e.target.files)} />
    </div>
  );
}
