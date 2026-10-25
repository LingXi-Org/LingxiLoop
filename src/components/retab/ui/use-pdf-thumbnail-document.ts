"use client";

import { useKeyedMountEffect } from "@/components/retab/hooks/use-keyed-mount-effect";
import {
  readPdfDocumentResource,
  releasePdfDocumentResource,
  retainPdfDocumentResource,
} from "@/components/retab/lib/pdf-document-resource";
import type { ViewerResource } from "@/components/retab/lib/viewer-resource";

import { joinEffectKey } from "@/components/retab/lib/effect-key";

export function usePdfThumbnailDocument(resource: ViewerResource) {
  const content = resource.content;
  const doc = readPdfDocumentResource(content);

  const retainEffectKey = joinEffectKey([
    "pdf-thumbnail-document",
    content.sourceKind,
    content.key,
    doc,
  ]);
  useKeyedMountEffect(retainEffectKey, () => {
    retainPdfDocumentResource(content, doc);
    return () => releasePdfDocumentResource(content, doc);
  });

  return doc;
}
