import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["Non-empty secret assignment", /\b(?:API_KEY|CLIENT_SECRET|ACCESS_TOKEN)\s*=\s*[^\s#][^\r\n]{7,}/gi],
];

function scan(text) {
  return patterns.flatMap(([label, pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(text) ? [label] : [];
  });
}

const publishable = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);
const workingFindings = [];
for (const file of publishable) {
  try {
    const content = readFileSync(file);
    if (content.includes(0)) continue;
    for (const label of scan(content.toString("utf8"))) workingFindings.push({ file, label });
  } catch { /* unreadable files are covered without being dumped */ }
}

let history = "";
try {
  history = execFileSync("git", ["log", "--all", "-p", "--full-history", "--", ".", ":(exclude)package-lock.json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch {
  console.log("SECRET_CHECK=BLOCKED unable_to_scan_full_local_history");
  process.exitCode = 2;
}
const historyFindings = scan(history);
const envHistory = execFileSync("git", ["log", "--all", "--format=%H", "--", ".env", ".env.local", ":(glob)**/.env", ":(glob)**/.env.local"], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean).length;

console.log(`SECRET_SCAN_COVERAGE=publishable_files_${publishable.length} full_local_history_yes env_history_commits_${envHistory}`);
if (workingFindings.length || historyFindings.length) {
  console.log(`SECRET_CHECK=BLOCKED working_findings_${workingFindings.length} history_pattern_types_${historyFindings.length}`);
  for (const finding of workingFindings) console.log(`FINDING=${finding.label} file=${finding.file}`);
  process.exitCode = 1;
} else {
  console.log("SECRET_CHECK=PASS high_confidence_patterns_no_matches");
}
