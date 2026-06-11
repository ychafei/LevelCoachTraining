import React from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { formatInstantInTz } from '@/lib/scheduleET';
import { resolveSport } from '@/features/athlete/sportMeta';
import { ScoreBar } from '@/features/athlete/portalShared';

function humanize(key) {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

// Normalise a stored scores payload against the sport's assessment_template.
// Supports both shapes coaches may have saved:
//   nested: { technical: { first_touch: 7, ... }, physical: { ... } }
//   flat:   { first_touch: 7, acceleration: 6, ... }
// Returns [{ key, label, avg, skills: [{ key, label, score, description }] }].
export function normalizeAssessmentScores(assessment, sportValue) {
  let raw = assessment?.scores;
  if (typeof raw === 'string' && raw.trim()) {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];

  const sport = resolveSport(sportValue || assessment?.sport_key);
  const template = sport?.assessment_template;
  const entries = Object.entries(raw);
  const categories = [];

  const isNested = entries.length > 0
    && entries.every(([, value]) => value && typeof value === 'object' && !Array.isArray(value));

  if (isNested) {
    for (const [categoryKey, skills] of entries) {
      const templateCategory = template?.categories?.find((c) => c.key === categoryKey);
      const skillsOut = [];
      for (const [skillKey, value] of Object.entries(skills)) {
        const score = clampScore(value);
        if (score === null) continue;
        const templateSkill = templateCategory?.skills?.find((s) => s.key === skillKey);
        skillsOut.push({
          key: skillKey,
          label: templateSkill?.label || humanize(skillKey),
          description: templateSkill?.description || '',
          score,
        });
      }
      if (skillsOut.length > 0) {
        categories.push({
          key: categoryKey,
          label: templateCategory?.label || humanize(categoryKey),
          skills: skillsOut,
        });
      }
    }
  } else {
    const used = new Set();
    for (const templateCategory of template?.categories || []) {
      const skillsOut = [];
      for (const templateSkill of templateCategory.skills) {
        if (raw[templateSkill.key] === undefined) continue;
        const score = clampScore(raw[templateSkill.key]);
        if (score === null) continue;
        used.add(templateSkill.key);
        skillsOut.push({
          key: templateSkill.key,
          label: templateSkill.label,
          description: templateSkill.description,
          score,
        });
      }
      if (skillsOut.length > 0) {
        categories.push({ key: templateCategory.key, label: templateCategory.label, skills: skillsOut });
      }
    }
    const leftovers = entries
      .map(([key, value]) => ({ key, label: humanize(key), description: '', score: clampScore(value) }))
      .filter((skill) => skill.score !== null && !used.has(skill.key));
    if (leftovers.length > 0) {
      categories.push({ key: 'other', label: 'Additional skills', skills: leftovers });
    }
  }

  return categories.map((category) => ({
    ...category,
    avg: Math.round((category.skills.reduce((sum, s) => sum + s.score, 0) / category.skills.length) * 10) / 10,
  }));
}

// Per-category breakdown for one assessment. The sport's template drives the
// labels/groupings, so deep templates (e.g. soccer) automatically render all
// of their skill categories while every other sport still works.
export default function AssessmentView({ assessment, sportValue, coachName = '' }) {
  const categories = normalizeAssessmentScores(assessment, sportValue);
  const sport = resolveSport(sportValue || assessment?.sport_key);

  if (categories.length === 0) {
    return (
      <p className="rounded-md border border-border bg-background/40 p-4 text-sm text-muted-foreground">
        This assessment has no readable scores yet.
      </p>
    );
  }

  const radarData = categories.map((category) => ({ label: category.label, avg: category.avg }));
  const assessedAt = assessment?.assessed_at || assessment?.created_date;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {sport && <span className="font-semibold text-foreground">{sport.display_name}</span>}
        {assessedAt && <span>Assessed {formatInstantInTz(assessedAt, undefined, { hour: undefined, minute: undefined, timeZoneName: undefined })}</span>}
        {coachName && <span>by {coachName}</span>}
        <span>Scale: 1–10</span>
      </div>

      {categories.length >= 3 && (
        <div className="h-64 w-full" role="img" aria-label="Radar chart of category averages">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
              <Tooltip
                formatter={(value) => [`${value} / 10`, 'Average']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  color: 'hsl(var(--foreground))',
                  fontSize: 12,
                }}
              />
              <Radar
                dataKey="avg"
                stroke="hsl(var(--accent))"
                fill="hsl(var(--accent))"
                fillOpacity={0.25}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {categories.map((category) => (
          <div key={category.key} className="rounded-md border border-border bg-background/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground">{category.label}</h4>
              <span className="text-xs font-bold text-accent">{category.avg} / 10</span>
            </div>
            <ul className="space-y-2.5">
              {category.skills.map((skill) => (
                <li key={skill.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground" title={skill.description || undefined}>{skill.label}</span>
                    <span className="font-semibold text-foreground">{skill.score}</span>
                  </div>
                  <ScoreBar value={skill.score} label={`${skill.label}: ${skill.score} out of 10`} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {assessment?.notes && (
        <div className="rounded-md border border-border bg-background/40 p-4">
          <h4 className="text-sm font-semibold text-foreground">Coach notes</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{assessment.notes}</p>
        </div>
      )}
    </div>
  );
}
