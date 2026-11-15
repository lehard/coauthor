import { Copy, Link2, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useReadLink, useSharingActions } from "@/data/sharing";

import { useProjectData } from "./ProjectContext";

// The window «Поделиться» of a story (openspec/specs/web/workspace, «Окно «Поделиться» со ссылкой»): for the
// beta only the link «почитать» of the open draft. Inviting participants is off the screen
// (business-intents/share-read-link-only.md); the core still checks every action by the role.

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The address of the page that reads a draft by the key of its link. */
function readLinkUrl(key: string): string {
  return `${window.location.origin}/read/${key}`;
}

export function ShareDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mx-2 mb-1 justify-start gap-2 rounded-full"
        onClick={() => setOpen(true)}
      >
        <Share2 />
        Поделиться
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-auto rounded-panel bg-paper shadow-paper sm:max-w-lg">
          {open && <ShareContent />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShareContent() {
  const { project, draft } = useProjectData();
  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="text-heading-2">Поделиться</DialogTitle>
        <DialogDescription>
          Дайте почитать текст сценария «{project.title}» по ссылке. Приглашать
          участников пока нельзя.
        </DialogDescription>
      </DialogHeader>
      <ReadLinkSection draftId={draft.id} draftName={draft.name} />
    </div>
  );
}

function ReadLinkSection({
  draftId,
  draftName,
}: {
  draftId: string;
  draftName: string;
}) {
  const { link, error, reload } = useReadLink(draftId, true);
  const actions = useSharingActions();
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(run: () => Promise<unknown>) {
    setFailure(null);
    setCopied(false);
    try {
      await run();
      await reload();
    } catch (e) {
      setFailure(errorText(e));
    }
  }

  return (
    <section className="grid gap-2" aria-label="Ссылка почитать">
      <h3 className="flex items-center gap-2 font-semibold">
        <Link2 className="size-4" />
        Ссылка почитать
      </h3>
      <p className="text-caption text-muted-foreground">
        По ссылке без входа виден только текст сценария драфта «{draftName}»:
        без героев, мира, заметок и комментариев.
      </p>
      {error !== null && error !== undefined && (
        <p role="alert" className="text-caption text-destructive">
          {errorText(error)}
        </p>
      )}
      {link === null && (
        <Button
          variant="outline"
          className="justify-self-start rounded-full"
          onClick={() => void act(() => actions.createLink(draftId))}
        >
          Создать ссылку
        </Button>
      )}
      {link !== null && link !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            readOnly
            value={readLinkUrl(link.key)}
            aria-label="Адрес ссылки"
            className="min-w-[12rem] flex-1 bg-paper"
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setFailure(null);
              navigator.clipboard.writeText(readLinkUrl(link.key)).then(
                () => setCopied(true),
                (e: unknown) => setFailure(errorText(e)),
              );
            }}
          >
            <Copy />
            {copied ? "Скопировано" : "Скопировать"}
          </Button>
          <Button
            variant="ghost"
            className="rounded-full text-destructive"
            onClick={() => void act(() => actions.removeLink(draftId))}
          >
            Отключить
          </Button>
        </div>
      )}
      {failure !== null && (
        <p role="alert" className="text-caption text-destructive">
          {failure}
        </p>
      )}
    </section>
  );
}
