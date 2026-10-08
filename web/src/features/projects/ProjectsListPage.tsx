import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useCreateProject, useProjects } from "./api";

export default function ProjectsListPage() {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();
  const { data, isLoading, isError } = useProjects();
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await create.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
    });
    setName("");
    setDescription("");
    void navigate(`/projects/${res.project.id}`);
  }

  return (
    <div
      className="container mx-auto max-w-3xl px-4 py-8"
      data-testid="projects-page"
    >
      <h1 className="mb-6 text-2xl font-bold">{t("title")}</h1>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="mb-8 grid gap-2"
        data-testid="project-create-form"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("create.name")}
          aria-label={t("create.name")}
          data-testid="project-create-name"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("create.description")}
          aria-label={t("create.description")}
          data-testid="project-create-description"
        />
        {create.isError && (
          <p role="alert" className="text-sm text-red-600">
            {t("create.error")}
          </p>
        )}
        <div>
          <Button
            type="submit"
            disabled={!name.trim() || create.isPending}
            data-testid="project-create-submit"
          >
            {t("create.submit")}
          </Button>
        </div>
      </form>

      {isLoading && <p>{t("loading")}</p>}
      {isError && (
        <p role="alert" className="text-red-600">
          {t("loadError")}
        </p>
      )}
      {data && data.items.length === 0 && (
        <p className="text-muted-foreground" data-testid="projects-empty">
          {t("empty")}
        </p>
      )}
      <ul className="grid gap-3" data-testid="projects-list">
        {data?.items.map((p) => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`} data-testid={`project-link-${p.id}`}>
              <Card className="p-4 transition-colors hover:bg-accent">
                <div className="font-semibold">{p.name}</div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {p.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("meetingCount", { count: p.meeting_count })}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
