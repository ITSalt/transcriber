import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ParticipantSide } from "@transcrib/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { splitList } from "./api";

export interface ParticipantValue {
  name: string;
  aliases: string[];
  role: string | null;
  organization: string | null;
  side: ParticipantSide;
}

export interface TermValue {
  term: string;
  variants: string[];
  definition: string | null;
  asr_keyterm: boolean;
}

const NATIVE_SELECT_CLASS =
  "flex h-10 w-full rounded-sm border border-[var(--color-input)] bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";

function orNull(raw: string): string | null {
  return raw.trim() === "" ? null : raw.trim();
}

/** Inline add-form for one participant (name / spelling variants / role / org / side). */
export function ParticipantForm({
  onSubmit,
  busy,
  submitLabel,
  testId = "participant-form",
}: {
  onSubmit: (value: ParticipantValue) => void | Promise<void>;
  busy?: boolean;
  submitLabel?: string;
  testId?: string;
}) {
  const { t } = useTranslation("projects");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [role, setRole] = useState("");
  const [organization, setOrganization] = useState("");
  const [side, setSide] = useState<ParticipantSide>("OTHER");

  async function submit() {
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      aliases: splitList(aliases),
      role: orNull(role),
      organization: orNull(organization),
      side,
    });
    setName("");
    setAliases("");
    setRole("");
    setOrganization("");
    setSide("OTHER");
  }

  return (
    <div
      className="grid gap-2 sm:grid-cols-2"
      data-testid={testId}
      role="group"
      aria-label={t("participants.add")}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("participants.name")}
        aria-label={t("participants.name")}
        data-testid={`${testId}-name`}
      />
      <Input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder={t("participants.aliases")}
        aria-label={t("participants.aliases")}
        data-testid={`${testId}-aliases`}
      />
      <Input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder={t("participants.role")}
        aria-label={t("participants.role")}
        data-testid={`${testId}-role`}
      />
      <Input
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
        placeholder={t("participants.organization")}
        aria-label={t("participants.organization")}
        data-testid={`${testId}-organization`}
      />
      <select
        className={NATIVE_SELECT_CLASS}
        value={side}
        onChange={(e) => setSide(ParticipantSide.parse(e.target.value))}
        aria-label={t("participants.side")}
        data-testid={`${testId}-side`}
      >
        {ParticipantSide.options.map((s) => (
          <option key={s} value={s}>
            {t(`side.${s}`)}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !name.trim()}
        onClick={() => void submit()}
        data-testid={`${testId}-submit`}
      >
        {submitLabel ?? t("participants.add")}
      </Button>
    </div>
  );
}

/** Inline add-form for one glossary term (term / variants / definition / for-ASR flag). */
export function TermForm({
  onSubmit,
  busy,
  submitLabel,
  testId = "term-form",
}: {
  onSubmit: (value: TermValue) => void | Promise<void>;
  busy?: boolean;
  submitLabel?: string;
  testId?: string;
}) {
  const { t } = useTranslation("projects");
  const [term, setTerm] = useState("");
  const [variants, setVariants] = useState("");
  const [definition, setDefinition] = useState("");
  const [asr, setAsr] = useState(false);

  async function submit() {
    if (!term.trim()) return;
    await onSubmit({
      term: term.trim(),
      variants: splitList(variants),
      definition: orNull(definition),
      asr_keyterm: asr,
    });
    setTerm("");
    setVariants("");
    setDefinition("");
    setAsr(false);
  }

  return (
    <div
      className="grid gap-2 sm:grid-cols-2"
      data-testid={testId}
      role="group"
      aria-label={t("glossary.add")}
    >
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={t("glossary.term")}
        aria-label={t("glossary.term")}
        data-testid={`${testId}-term`}
      />
      <Input
        value={variants}
        onChange={(e) => setVariants(e.target.value)}
        placeholder={t("glossary.variants")}
        aria-label={t("glossary.variants")}
        data-testid={`${testId}-variants`}
      />
      <Input
        value={definition}
        onChange={(e) => setDefinition(e.target.value)}
        placeholder={t("glossary.definition")}
        aria-label={t("glossary.definition")}
        className="sm:col-span-2"
        data-testid={`${testId}-definition`}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={asr}
          onChange={(e) => setAsr(e.target.checked)}
          data-testid={`${testId}-asr`}
        />
        {t("glossary.asrKeyterm")}
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !term.trim()}
        onClick={() => void submit()}
        data-testid={`${testId}-submit`}
      >
        {submitLabel ?? t("glossary.add")}
      </Button>
    </div>
  );
}
