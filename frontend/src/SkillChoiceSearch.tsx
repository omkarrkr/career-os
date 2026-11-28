import { useState } from 'react';
export function SkillChoiceSearch({ disabled, onSearch }: { disabled: boolean; onSearch: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <div className="catalog-search"><label htmlFor="link-skill-search">Search skill choices</label><div className="goal-search-controls"><input id="link-skill-search" type="search" maxLength={80} value={value} disabled={disabled} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSearch(value.trim()); } }} /><button className="button secondary" type="button" disabled={disabled} onClick={() => onSearch(value.trim())}>Search skill choices</button></div></div>;
}
