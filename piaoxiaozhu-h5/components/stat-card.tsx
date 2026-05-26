interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

export default function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-md p-3 shadow-card flex-1">
      <p className="text-xs text-[#999999] mb-1">{label}</p>
      <p className="text-lg font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
