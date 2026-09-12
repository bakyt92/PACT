export interface VoiceAiBrief {
  public: {
    title: string;
    market: string;
    objective: string;
    requirements: string[];
    categoryRule: string;
  };
  private: {
    internalContact: string;
  };
}

export const VOICE_AI_BRIEF: VoiceAiBrief = {
  public: {
    title: "Voice AI Pilot: France",
    market: "France",
    objective:
      "Research public providers relevant to voice interaction and clinical documentation, keeping those categories distinct.",
    requirements: [
      "Use public vendor information and cite sources.",
      "Separate conversational voice interaction from clinical documentation tooling.",
      "Create one actionable comparison task without medical recommendations or an invented ranking.",
    ],
    categoryRule:
      "Distinguish voice interaction providers from clinical documentation providers; some vendors may span both only when a source supports it.",
  },
  private: {
    internalContact: "PACT_PRIVATE_CANARY_7f3b_do_not_export",
  },
};

export type PublicBrief = VoiceAiBrief["public"];

/** Build an allowlisted object; never copy and redact the source record. */
export function projectPublicBrief(brief: VoiceAiBrief): PublicBrief {
  return {
    title: brief.public.title,
    market: brief.public.market,
    objective: brief.public.objective,
    requirements: [...brief.public.requirements],
    categoryRule: brief.public.categoryRule,
  };
}
