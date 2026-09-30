import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";

// The bundled skills ship with the app; inline their SKILL.md text so the
// bundle is self-contained (no runtime file read of the renderer source tree).
import deepResearchSkill from "./seed-skills/deep-research-skill.md" with { type: "text" };
import frontendDesignSkill from "./seed-skills/frontend-design-skill.md" with { type: "text" };
import grillMeSkill from "./seed-skills/grill-me-skill.md" with { type: "text" };

/** The llm-space-managed skills discovery folder (`<root>/skills`). */
export function getManagedSkillsDir(): string {
  return path.join(getLlmSpaceHomePath(), "skills");
}

/**
 * On a fresh install `<root>/skills` does not exist. Create it and seed the
 * bundled skills as `<name>/SKILL.md`, so the General Agent example has skills
 * to load out of the box. No-op once the folder exists — a user who has cleared
 * or edited their skills folder is never overwritten.
 */
export async function seedSkills(): Promise<void> {
  const skillsDir = getManagedSkillsDir();
  if (existsSync(skillsDir)) {
    return;
  }
  const skills = [
    { name: "deep-research", content: deepResearchSkill },
    { name: "frontend-design", content: frontendDesignSkill },
    { name: "grill-me", content: grillMeSkill },
  ];
  await Promise.all(
    skills.map(async ({ name, content }) => {
      const dir = path.join(skillsDir, name);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "SKILL.md"), content, "utf8");
    })
  );
}
