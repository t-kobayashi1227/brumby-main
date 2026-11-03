import { underlineTabClass } from "../_lib/ui";

interface Props {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}

export default function UnderlineTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="flex gap-1 mb-4.5 border-b border-line overflow-x-auto">
      {tabs.map((t) => (
        <div key={t.key} onClick={() => onChange(t.key)} className={underlineTabClass(active === t.key)}>
          {t.label}
        </div>
      ))}
    </div>
  );
}
