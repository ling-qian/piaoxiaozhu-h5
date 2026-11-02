interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

export default function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-md p-3 shadow-card flex-1 animate-fade-in-up">
      <p className="text-xs text-[#64748B] mb-1">{label}</p>
      <p className="text-lg font-semibold truncate" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
