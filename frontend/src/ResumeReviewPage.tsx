import { useEffect, useState, type FormEvent } from 'react';
import { useFormGuard } from './lib/form-guard';
import { readResumePdf } from './lib/resume-pdf';
import { ResumeLearningGoal } from './ResumeLearningGoal';

type Objective = 'improve' | 'tailor' | 'learn';
type Finding = { title: string; evidence?: string; action: string; learningSkill?: string };
const normalize = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#]*/gu)?.join(' ') ?? '';
const lines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const commonSkills = ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'REST APIs', 'GraphQL', 'Python', 'Java', 'C++', 'C#', 'SQL', 'PostgreSQL', 'MongoDB', 'Git', 'Docker', 'AWS', 'Linux', 'Excel', 'Power BI', 'Data analysis', 'Machine learning', 'Unit testing', 'Accessibility', 'Communication', 'Teamwork'];

function suggestRequirements(description: string) {
  const words = ' ' + normalize(description) + ' ';
  return commonSkills.filter(skill => words.includes(' ' + normalize(skill) + ' ')).slice(0, 20);
}

function review(resume: string, objective: Objective, criteria: string): Finding[] {
  const resumeLines = lines(resume);
  if (objective === 'improve') {
    const bullets = resumeLines.filter(line => /^[-•*▪]\s*|^\d+[.)]\s+/.test(line));
    const samples = bullets.length ? bullets : resumeLines.filter(line => line.length >= 45);
    if (!samples.length) return [{ title: 'Add a concrete example', action: 'Pick one project or experience. Describe your contribution, how you did it, and what happened.' }];
    return samples.slice(0, 5).map(line => ({
      title: 'Review this line',
      evidence: line,
      action: /\d/.test(line)
        ? 'Check that the numbers have context. Explain what you measured and what your contribution was.'
        : 'Name what you built, tested, or improved. Add a result if you can support it with a fact.',
    }));
  }

  return [...new Set(lines(criteria))].map(requirement => {
    const phrase = normalize(requirement);
    const evidence = resumeLines.find(line => (' ' + normalize(line) + ' ').includes(' ' + phrase + ' '));
    return {
      title: requirement,
      ...(evidence ? { evidence } : {}),
      ...(!evidence ? { learningSkill: requirement } : {}),
      action: evidence
        ? 'Phrase found. Check whether the surrounding line explains how you used it.'
        : objective === 'learn'
          ? 'Phrase not found. If this is new to you, build a small exercise using it and record what you did.'
          : 'Phrase not found. If you have relevant experience, describe it using a concrete example in your own words.',
    };
  });
}

export function ResumeReviewPage({ userId }: { userId: number }) {
  const [goalSkill, setGoalSkill] = useState<string | null>(null);
  const [objective, setObjective] = useState<Objective>('improve');
  const [resume, setResume] = useState('');
  const [criteria, setCriteria] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [suggestionNotice, setSuggestionNotice] = useState('');
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importNotice, setImportNotice] = useState('');
  useFormGuard(Boolean(resume || criteria || jobDescription), importing);
  useEffect(() => { document.title = 'Resume Review · CareerOS'; }, []);

  const requirements = lines(criteria);
  const requiresCriteria = objective !== 'improve';
  const invalidCriteria = requiresCriteria && (
    !requirements.length || requirements.length > 20 || requirements.some(line => !normalize(line) || line.length > 100)
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!importing && resume.trim() && !invalidCriteria) setFindings(review(resume, objective, criteria));
  };
  const importPdf = async (file: File) => {
    if (importing || (resume.trim() && !window.confirm('Replace the current resume text with this PDF?'))) return;
    setImporting(true);
    setImportError('');
    setImportNotice('');
    try {
      const text = await readResumePdf(file);
      setResume(text.slice(0, 20000));
      setFindings(null);
      setImportNotice(text.length > 20000 ? 'Imported the first 20,000 characters. Check the extracted text before reviewing.' : 'PDF imported. Check the extracted text before reviewing.');
    } catch (error) {
      setImportError(error instanceof Error && error.name === 'Error' ? error.message : 'Could not read this PDF. Try an unlocked PDF or paste your resume text.');
    } finally {
      setImporting(false);
    }
  };

  return <main className="workspace-main" id="main-content" tabIndex={-1}>
    <div className="page-intro"><div><h1>Resume Review</h1><p className="muted">Upload a PDF or paste your resume, then choose what you want help with.</p></div></div>
    <div className="skills-layout">
      <form className="panel skills-panel skill-form" onSubmit={submit}>
        <div className="goal-field">
          <label htmlFor="resume-objective">What do you want to do?</label>
          <select id="resume-objective" value={objective} onChange={event => { setObjective(event.target.value as Objective); setCriteria(''); setSuggestionNotice(''); setFindings(null); }}>
            <option value="improve">Improve my resume</option>
            <option value="tailor">Tailor it to a job</option>
            <option value="learn">Choose what to learn next</option>
          </select>
        </div>
        <div className="goal-field">
          <label htmlFor="resume-pdf">Upload resume PDF</label>
          <input id="resume-pdf" type="file" accept=".pdf,application/pdf" disabled={importing} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importPdf(file);
          }} />
          <span className="field-hint">Up to 10 MB and 15 pages. The file is read in your browser.</span>
          {importing && <p role="status">Reading PDF…</p>}
          {importError && <p role="alert">{importError}</p>}
          {importNotice && <p role="status">{importNotice}</p>}
        </div>
        <div className="goal-field">
          <label htmlFor="resume-text">Resume text</label>
          <textarea id="resume-text" rows={11} required maxLength={20000} disabled={importing} value={resume} onChange={event => { setResume(event.target.value); setFindings(null); }} />
          <span className="field-hint">Your text stays in this browser tab while you review it.</span>
        </div>
        {objective === 'tailor' && <div className="goal-field">
          <label htmlFor="job-description">Job description</label>
          <textarea id="job-description" rows={7} maxLength={20000} value={jobDescription} onChange={event => { setJobDescription(event.target.value); setSuggestionNotice(''); setFindings(null); }} />
          <button className="button secondary" type="button" disabled={!jobDescription.trim()} onClick={() => {
            const suggestions = suggestRequirements(jobDescription);
            if (!suggestions.length) {
              setSuggestionNotice('No common skill phrases found. Add the requirements you want to compare below.');
              return;
            }
            if (criteria.trim() && !window.confirm('Replace your current comparison phrases with these suggestions?')) return;
            setCriteria(suggestions.join('\n'));
            setFindings(null);
            setSuggestionNotice('Check these suggested skill phrases against the job description. Add or remove phrases before reviewing.');
          }}>Suggest skill phrases</button>
          {suggestionNotice && <p role="status">{suggestionNotice}</p>}
        </div>}
        {requiresCriteria && <div className="goal-field">
          <label htmlFor="resume-criteria">{objective === 'tailor' ? 'Key phrases from the job description' : 'Skills you want to learn'}</label>
          <textarea id="resume-criteria" rows={5} required maxLength={2020} value={criteria} onChange={event => { setCriteria(event.target.value); setFindings(null); }} />
          <span className="field-hint">Enter up to 20 short phrases, one per line. For example, SQL or REST APIs.</span>
          {criteria.trim() && invalidCriteria && <p role="alert">Use 1–20 phrases with letters or numbers and at most 100 characters each.</p>}
        </div>}
        <button className="button primary" disabled={importing || !resume.trim() || invalidCriteria}>Review resume</button>
        <button className="button text-button" type="button" disabled={importing} onClick={() => { setResume(''); setCriteria(''); setJobDescription(''); setSuggestionNotice(''); setFindings(null); setImportNotice(''); setImportError(''); }}>Clear review</button>
      </form>
      <section className="panel skills-panel" aria-labelledby="resume-results">
        <h2 id="resume-results">Review findings</h2>
        {requiresCriteria && <p className="field-hint">This compares the phrases you entered with the words in your resume. Check related experience and synonyms yourself.</p>}
        {findings ? <><p role="status">{findings.length} findings ready to review.</p><ul className="personal-skill-list">{findings.map((finding, index) =>
          <li key={index}><div><h3>{finding.title}</h3>{finding.evidence && <blockquote className="skill-notes">{finding.evidence}</blockquote>}<p className="skill-notes">{finding.action}</p>{finding.learningSkill && goalSkill === null && <button className="button secondary" type="button" onClick={() => setGoalSkill(finding.learningSkill ?? null)}>Create learning goal</button>}</div></li>
        )}</ul></> : <p>Your feedback will appear here after you run a review.</p>}
        {goalSkill !== null && <ResumeLearningGoal skill={goalSkill} userId={userId} onCancel={() => setGoalSkill(null)} />}
      </section>
    </div>
  </main>;
}
