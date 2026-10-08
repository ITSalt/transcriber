import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SlotOutlet } from "@/components/layout/slot";
import {
  useAddGlossaryTerm,
  useAddParticipant,
  useDeleteGlossaryTerm,
  useDeleteParticipant,
  useDeleteProject,
  useProject,
  useUpdateProject,
} from "./api";
import { ParticipantForm, TermForm } from "./forms";

export default function ProjectDetailPage() {
  const { t } = useTranslation("projects");
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const remove = useDeleteProject();
  const addParticipant = useAddParticipant(projectId);
  const delParticipant = useDeleteParticipant(projectId);
  const addTerm = useAddGlossaryTerm(projectId);
  const delTerm = useDeleteGlossaryTerm(projectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (data) {
      setName(data.project.name);
      setDescription(data.project.description ?? "");
    }
  }, [data]);

  if (isLoading) return <p className="p-8">{t("loading")}</p>;
  if (isError || !data) {
    return (
      <p role="alert" className="p-8 text-red-600">
        {t("notFound")}
      </p>
    );
  }

  const dirty =
    name.trim() !== data.project.name ||
    (description.trim() || null) !== data.project.description;

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    await remove.mutateAsync(projectId);
    void navigate("/projects");
  }

  return (
    <div
      className="container mx-auto max-w-3xl px-4 py-8"
      data-testid="project-detail"
    >
      <Link to="/projects" className="text-sm text-muted-foreground">
        ← {t("title")}
      </Link>

      <section className="mt-4 mb-8 grid gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("create.name")}
          data-testid="project-name"
          className="text-lg font-semibold"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("create.description")}
          aria-label={t("create.description")}
          data-testid="project-description"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!dirty || !name.trim() || update.isPending}
            onClick={() =>
              update.mutate({
                name: name.trim(),
                description: description.trim() || null,
              })
            }
            data-testid="project-save"
          >
            {t("save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDelete()}
            data-testid="project-delete"
          >
            {t("delete")}
          </Button>
        </div>
      </section>

      <section className="mb-8" data-testid="project-participants">
        <h2 className="mb-3 text-lg font-semibold">{t("participants.title")}</h2>
        {data.participants.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            {t("participants.empty")}
          </p>
        )}
        <ul className="mb-4 grid gap-2">
          {data.participants.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-3 rounded-sm border p-3"
              data-testid={`participant-${p.id}`}
            >
              <div>
                <div className="font-medium">{p.name}</div>
                {p.aliases.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {p.aliases.join(", ")}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {p.role && <Badge variant="secondary">{p.role}</Badge>}
                  {p.organization && (
                    <Badge variant="outline">{p.organization}</Badge>
                  )}
                  <Badge variant="outline">{t(`side.${p.side}`)}</Badge>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => delParticipant.mutate(p.id)}
                aria-label={t("remove")}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
        <ParticipantForm
          busy={addParticipant.isPending}
          onSubmit={async (v) => {
            await addParticipant.mutateAsync(v);
          }}
        />
      </section>

      <section className="mb-8" data-testid="project-glossary">
        <h2 className="mb-3 text-lg font-semibold">{t("glossary.title")}</h2>
        {data.glossary.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            {t("glossary.empty")}
          </p>
        )}
        <ul className="mb-4 grid gap-2">
          {data.glossary.map((g) => (
            <li
              key={g.id}
              className="flex items-start justify-between gap-3 rounded-sm border p-3"
              data-testid={`term-${g.id}`}
            >
              <div>
                <div className="font-medium">
                  {g.term}
                  {g.asr_keyterm && (
                    <Badge variant="secondary" className="ml-2">
                      {t("glossary.forAsr")}
                    </Badge>
                  )}
                </div>
                {g.variants.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {g.variants.join(", ")}
                  </div>
                )}
                {g.definition && <p className="mt-1 text-sm">{g.definition}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => delTerm.mutate(g.id)}
                aria-label={t("remove")}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
        <TermForm
          busy={addTerm.isPending}
          onSubmit={async (v) => {
            await addTerm.mutateAsync(v);
          }}
        />
      </section>

      <div className="empty:hidden" data-testid="slot-project-tabs">
        <SlotOutlet name="project.tabs" projectId={projectId} />
      </div>
    </div>
  );
}
