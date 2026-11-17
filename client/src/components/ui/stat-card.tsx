import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, CheckCircle, Clock, AlertTriangle, Box } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: string;
  color: string;
}

export default function StatCard({ title, value, icon, color }: StatCardProps) {
  function getIcon() {
    switch (icon) {
      case 'check-circle':
        return <CheckCircle className={`h-6 w-6 text-${color}`} />;
      case 'clock':
        return <Clock className={`h-6 w-6 text-${color}`} />;
      case 'alert-triangle':
        return <AlertTriangle className={`h-6 w-6 text-${color}`} />;
      case 'box':
      default:
        return <Box className={`h-6 w-6 text-${color}`} />;
    }
  }
  
  function getBgColor() {
    switch (color) {
      case 'success':
        return 'bg-success bg-opacity-10';
      case 'warning':
        return 'bg-warning bg-opacity-10';
      case 'error':
        return 'bg-error bg-opacity-10';
      case 'accent':
      default:
        return 'bg-accent bg-opacity-10';
    }
  }
  
  return (
    <Card className="flex items-center p-6">
      <div className={`w-12 h-12 rounded-lg ${getBgColor()} flex items-center justify-center mr-4`}>
        {getIcon()}
      </div>
      <div>
        <div className="text-sm text-gray-500">{title}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </div>
    </Card>
  );
}
