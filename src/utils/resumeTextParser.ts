/**
 * Fallback CV/resume parser — works purely with text, no AI required.
 * Called when Gemini is rate-limited or unavailable.
 *
 * Handles common PDF parsing artifacts:
 * - Concatenated skill chips (ReactTailwindTypeScript → React, Tailwind, TypeScript)
 * - Social links / profile IDs appearing in skill sections
 * - Location lines (Kigali, Rwanda) used instead of job titles
 */

export interface ParsedResumeProfile {
  name: string;
  position: string;
  bio: string;
  phone: string;
  skills: string[];
  languages: string[];
  experience: Array<{ title: string; company: string; duration: string; description?: string }>;
  education: Array<{ degree: string; institution: string; year: string }>;
}

// ── Section header patterns ────────────────────────────────────────────────────
const SKILL_HEADERS   = /^(technical\s+|core\s+|key\s+)?skills?(\s+(set|stack|&\s*\w+))?$/i;
const LANG_HEADERS    = /^(languages?(\s+(spoken|known|proficiency|skills?))?|spoken\s+languages?)$/i;
const EXP_HEADERS     = /^(work\s+|professional\s+)?(experience|employment|history|career)$/i;
const EDU_HEADERS     = /^education(al)?(\s+(background|history|qualifications?))?$/i;
const SUMMARY_HEADERS = /^(professional\s+)?(summary|profile|objective|overview|about(\s+me)?)$/i;
const CONTACT_HEADERS = /^(contact(\s+info(rmation)?)?|personal\s+(details?|info))$/i;

const PHONE_RE      = /(?:\+?\d[\d\s\-().]{7,}\d)/g;
const EMAIL_RE      = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const YEAR_RE       = /\b(19|20)\d{2}\b/g;
const DATE_RANGE_RE = /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,]*)?(?:19|20)\d{2}\s*[-–—to]+\s*(?:present|current|now|(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,]*)?(?:19|20)\d{2})/gi;

// Location pattern: "City, Country" or "City, ST" (e.g. "Kigali, Rwanda", "New York, NY")
const LOCATION_RE = /^[A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]{1,25}$/;

// Social / URL patterns that should NOT be treated as skills
const NON_SKILL_RE = /linkedin|github|twitter|instagram|facebook|portfolio|website|findme|find\s*me|mailto:|https?:|www\.|\.com$|\.io$|\.dev$|@/i;

// ── Text preprocessing ────────────────────────────────────────────────────────

/**
 * Split a CamelCase-concatenated string into individual words.
 * Preserves known tech suffixes: Vue.js, Node.js, TypeScript, etc.
 * e.g. "ReactTailwindTypeScriptVue.jsNode.js" → ["React","Tailwind","TypeScript","Vue.js","Node.js"]
 */
function splitCamelConcat(raw: string): string[] {
  // First split on explicit delimiters
  const byDelimiters = raw.split(/[,;•·\t\/]+/).map(s => s.trim()).filter(Boolean);

  const result: string[] = [];
  for (const token of byDelimiters) {
    if (token.length <= 20 || /\s/.test(token)) {
      result.push(token);
      continue;
    }
    // Long token with no spaces → try CamelCase split
    // Insert marker before: uppercase following lowercase, or multiple uppercase → single uppercase
    const spaced = token
      .replace(/([a-z])([A-Z])/g, '$1\x00$2')
      .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1\x00$2');

    const parts = spaced.split('\x00').map(s => s.trim()).filter(s => s.length > 1);
    if (parts.length > 1) {
      result.push(...parts);
    } else {
      result.push(token);
    }
  }
  return result;
}

/**
 * Returns true if `s` looks like a real skill (tech, tool, methodology).
 * Rejects social links, URLs, email fragments, short noise, location strings.
 */
function isLikelySkill(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (/^\d+$/.test(trimmed)) return false;            // pure numbers
  if (/^[^a-zA-Z]+$/.test(trimmed)) return false;    // no letters at all
  if (NON_SKILL_RE.test(trimmed)) return false;       // social/URL patterns
  if (/^\s*[•\-–—*]\s*$/.test(trimmed)) return false; // lone bullet
  if (/^(in|at|by|for|and|the|of|to|a|an|or|but|is|are|was|were)$/i.test(trimmed)) return false;
  // Reject "Kigali,Rwanda" style location fragments
  if (LOCATION_RE.test(trimmed)) return false;
  // Reject profile IDs like "uwihanganye-edison-7b2970236"
  if (/[a-z]+-[a-z]+-[a-f0-9]{7,}/i.test(trimmed)) return false;
  // Reject "codeWithEdison" style handles (camelCase with a person name)
  // heuristic: ends in a proper name (>2 words CamelCase) — skip this one, too aggressive
  return true;
}

/**
 * Clean a single skill string: strip trailing punctuation, trim.
 */
function cleanSkill(s: string): string {
  return s.replace(/^[•\-–—*\s]+/, '').replace(/[.,:;!?\s]+$/, '').trim();
}

type Section = 'none' | 'skills' | 'languages' | 'experience' | 'education' | 'summary' | 'contact';

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseResumeText(text: string): ParsedResumeProfile {
  // Normalise line endings and strip zero-width chars
  const cleaned = text.replace(/\r\n/g, '\n').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Phone ────────────────────────────────────────────────────────────────────
  // Filter out date-range matches like "2024-2025" or "2020 - 2023"
  const phoneMatches = Array.from(text.matchAll(PHONE_RE))
    .map(m => m[0].trim())
    .filter(p => !/^\d{4}\s*[-–]\s*\d{4}$/.test(p) && !/^\d{4}$/.test(p));
  const phone = phoneMatches[0] || '';

  // ── Name (first non-email, non-phone, non-CV-header line ≤ 4 words) ─────────
  let name = '';
  for (const line of lines.slice(0, 10)) {
    if (EMAIL_RE.test(line)) continue;
    if (PHONE_RE.test(line)) continue;
    if (/^(curriculum vitae|resume|cv)$/i.test(line)) continue;
    if (/\d/.test(line)) continue;
    if (LOCATION_RE.test(line)) continue;
    const wordCount = line.split(/\s+/).length;
    if (wordCount >= 1 && wordCount <= 5) {
      name = line;
      break;
    }
  }

  // ── Segment into sections ────────────────────────────────────────────────────
  const sectionLines: Record<Section, string[]> = {
    none: [], skills: [], languages: [], experience: [], education: [], summary: [], contact: [],
  };
  let current: Section = 'none';

  for (const line of lines) {
    const low = line.toLowerCase().replace(/[:\-_]+$/, '').trim();

    // Also handle inline "Skills: React, Vue" — switch to skills and capture inline
    if (SKILL_HEADERS.test(low)) {
      current = 'skills';
      const inlineContent = line.replace(/^[^:]+:\s*/, '').trim();
      if (inlineContent) sectionLines.skills.push(inlineContent);
      continue;
    }
    if (LANG_HEADERS.test(low)) {
      current = 'languages';
      const inlineContent = line.replace(/^[^:]+:\s*/, '').trim();
      if (inlineContent) sectionLines.languages.push(inlineContent);
      continue;
    }
    if (EXP_HEADERS.test(low))     { current = 'experience'; continue; }
    if (EDU_HEADERS.test(low))     { current = 'education'; continue; }
    if (SUMMARY_HEADERS.test(low)) { current = 'summary'; continue; }
    if (CONTACT_HEADERS.test(low)) { current = 'contact'; continue; }
    sectionLines[current].push(line);
  }

  // ── Skills ───────────────────────────────────────────────────────────────────
  const rawSkills: string[] = [];
  for (const line of sectionLines.skills) {
    // Each line might be:
    //   a) "React, Node.js, TypeScript"  (comma separated)
    //   b) "ReactTailwindTypeScript"     (concatenated CamelCase — PDF chips)
    //   c) "• React  • Vue.js"           (bullets)
    const tokens = splitCamelConcat(line);
    for (const token of tokens) {
      const sub = token.split(/[,;•·|]+/).map(s => cleanSkill(s)).filter(Boolean);
      rawSkills.push(...sub);
    }
  }

  const uniqueSkills = [...new Set(
    rawSkills.map(cleanSkill).filter(isLikelySkill)
  )].slice(0, 25);

  // ── Languages ────────────────────────────────────────────────────────────────
  const rawLangs: string[] = [];
  for (const line of sectionLines.languages) {
    const tokens = splitCamelConcat(line);
    for (const token of tokens) {
      const sub = token.split(/[,;•·|\/]+/).map(s => cleanSkill(s)).filter(Boolean);
      rawLangs.push(...sub);
    }
  }
  // Strip proficiency levels (Beginner, Intermediate, Advanced, Fluent, Native, A1-C2)
  const PROFICIENCY_RE = /\b(native|fluent|advanced|intermediate|beginner|basic|professional|mother\s+tongue|[abc][12])\b/gi;
  const uniqueLangs = [...new Set(
    rawLangs
      .map(s => s.replace(PROFICIENCY_RE, '').replace(/[:\-–()]+/g, '').trim())
      .filter(s => s.length >= 2 && /^[A-Za-z]/.test(s) && !NON_SKILL_RE.test(s))
  )].slice(0, 10);

  // ── Bio / summary ────────────────────────────────────────────────────────────
  // Clean up concatenated words in bio too
  const bioRaw = sectionLines.summary.join(' ');
  // Insert spaces at camelCase boundaries in long runs
  const bio = bioRaw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    .slice(0, 500);

  // ── Experience ───────────────────────────────────────────────────────────────
  const experience: ParsedResumeProfile['experience'] = [];
  const expText = sectionLines.experience;

  /**
   * Is `line` a location string we should skip when looking for job title/company?
   */
  const isLocationLine = (line: string) =>
    LOCATION_RE.test(line) || /^kigali|rwanda|nairobi|kampala|accra|lagos|johannesburg|london|new york/i.test(line);

  /**
   * Is `line` a bullet-point description (starts with • or similar)?
   */
  const isBulletLine = (line: string) => /^[•\-–—*]/.test(line);

  /**
   * Does this line look like a description rather than a job title or company name?
   */
  const isDescriptionLine = (line: string) =>
    line.split(/\s+/).length > 7 ||                               // too many words for a title
    /^[a-z]/.test(line) ||                                        // starts lowercase
    (/[.!]$/.test(line) && line.split(/\s+/).length > 4) ||      // sentence ending with punctuation
    /^(designed|developed|managed|led|built|created|implemented|maintained|supported|responsible|worked|collaborated|coordinated|delivered|handled|oversaw|performed|provided|conducted|analysed|analyzed|mentored|trained|ensured|assisted|participated)/i.test(line);

  /**
   * Insert spaces at CamelCase boundaries (for concatenated PDF text).
   */
  const insertSpaces = (s: string) =>
    s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2');

  let i = 0;
  let lastDateIdx = -1; // boundary: don't scan back past the previous date line

  while (i < expText.length && experience.length < 5) {
    const line = expText[i];
    const dateMatch = line.match(DATE_RANGE_RE);
    const yearMatches = line.match(YEAR_RE);
    const hasDate = !!dateMatch || (yearMatches && yearMatches.length >= 1 && line.trim().length < 50);

    if (hasDate) {
      const duration = dateMatch ? dateMatch[0] : (yearMatches ? yearMatches.join(' – ') : '');

      // Look back up to 4 lines for title and company, but never past lastDateIdx
      let title = '';
      let company = '';
      const scanStart = Math.max(lastDateIdx + 1, 0);

      for (let back = 1; back <= 4 && i - back >= scanStart; back++) {
        const candidate = expText[i - back];
        if (!candidate || isBulletLine(candidate) || isLocationLine(candidate)) continue;
        if (candidate.match(YEAR_RE)) continue; // another date line
        if (isDescriptionLine(candidate)) continue; // skip description-like lines

        // Try "Title at Company" or "Title | Company"
        const atSplit = candidate.split(/\s+at\s+|\s*\|\s*/i);
        if (atSplit.length >= 2 && !title) {
          title = atSplit[0].trim();
          company = atSplit[1].trim();
          break;
        }

        if (!title) {
          title = candidate.trim();
        } else if (!company) {
          company = candidate.trim();
          break;
        }
      }

      // If only a company-like string was found as title, move it to company
      const looksLikeCompany = (s: string) =>
        /\b(ltd|inc|corp|llc|co\b|company|group|holding|holdings|technologies|tech|solutions|services|systems|consulting|partners|associates|ngo|agency|authority|ministry|hospital|foundation|trust|ict|natcom)\b/i.test(s) ||
        /[A-Z]{2,}/.test(s.replace(/\s+/g, ''));

      if (title && !company && looksLikeCompany(title)) {
        company = title;
        title = '';
      }

      // Look forward for description (skip locations, other dates)
      let description: string | undefined;
      for (let fwd = 1; fwd <= 3 && i + fwd < expText.length; fwd++) {
        const next = expText[i + fwd];
        if (!next || isLocationLine(next) || next.match(DATE_RANGE_RE)) continue;
        if (next.match(YEAR_RE) && next.trim().length < 20) continue;
        // Clean concatenated text and use as description
        description = insertSpaces(next.replace(/^[•\-–—*]\s*/, '')).slice(0, 200);
        break;
      }

      if (title || company) {
        experience.push({ title: title || '', company, duration, description });
      }

      lastDateIdx = i;
    }
    i++;
  }

  // Fallback: block-based parsing if date-anchored approach found nothing
  if (experience.length === 0 && expText.length > 0) {
    let block: string[] = [];
    for (const line of expText) {
      if (isLocationLine(line) || isBulletLine(line)) continue;
      if (line.match(DATE_RANGE_RE) || line.match(YEAR_RE) || block.length > 4) {
        if (block.length > 0) {
          const years = [...block.join(' ').matchAll(/\b(19|20)\d{2}\b/g)].map(m => m[0]);
          experience.push({
            title: block[0] || '',
            company: block[1] || '',
            duration: years.length >= 2 ? `${years[0]} – ${years[1]}` : years[0] || '',
            description: insertSpaces(block.slice(2).join(' ')).slice(0, 200),
          });
        }
        block = [line];
      } else {
        block.push(line);
      }
      if (experience.length >= 5) break;
    }
  }

  // ── Education ────────────────────────────────────────────────────────────────
  const education: ParsedResumeProfile['education'] = [];
  const eduText = sectionLines.education;
  let j = 0;

  while (j < eduText.length && education.length < 3) {
    const line = eduText[j];
    if (isLocationLine(line) || isBulletLine(line)) { j++; continue; }

    const years = [...line.matchAll(/\b(19|20)\d{2}\b/g)].map(m => m[0]);
    const year = years[years.length - 1] || '';

    const isInstitution = /university|college|school|institute|academy|polytechnic/i.test(line);

    if (years.length > 0 || isInstitution) {
      let institutionLine = isInstitution ? line : (j > 0 ? eduText[j - 1] : '');
      let degreeLine = institutionLine === line ? (j > 0 ? eduText[j - 1] : '') : line;

      // Guard against location being used as institution
      if (isLocationLine(institutionLine)) institutionLine = '';
      if (isLocationLine(degreeLine)) degreeLine = '';

      education.push({
        degree: insertSpaces(degreeLine.replace(/\b(19|20)\d{2}\b/g, '').trim()) || 'Degree',
        institution: insertSpaces(institutionLine.replace(/\b(19|20)\d{2}\b/g, '').trim()) || 'Institution',
        year,
      });
    } else if (j === 0) {
      const allYears = [...eduText.join(' ').matchAll(/\b(19|20)\d{2}\b/g)].map(m => m[0]);
      education.push({
        degree: line,
        institution: eduText[j + 1] || '',
        year: allYears[0] || '',
      });
      j += 2;
      continue;
    }
    j++;
  }

  // ── Position ──────────────────────────────────────────────────────────────────
  // Use first experience title if valid, else scan top of document
  let position = '';
  if (experience.length > 0 && experience[0].title) {
    position = experience[0].title;
  } else {
    for (const line of lines.slice(1, 8)) {
      if (EMAIL_RE.test(line)) continue;
      if (PHONE_RE.test(line)) continue;
      if (LOCATION_RE.test(line)) continue;
      if (line === name) continue;
      const wc = line.split(/\s+/).length;
      if (wc >= 1 && wc <= 6 && !/\d{4}/.test(line)) {
        position = line;
        break;
      }
    }
  }

  return { name, position, bio, phone, skills: uniqueSkills, languages: uniqueLangs, experience, education };
}
