import { Badge } from "@/components/ui/badge";

interface BadgeItem {
  label: string;
  color: string;
}

interface BadgeListProps {
  items: BadgeItem[];
}

export default function BadgeList({ items }: BadgeListProps) {
  function getBadgeClasses(color: string) {
    switch (color) {
      case 'blue':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      case 'green':
        return 'bg-green-100 text-green-800 hover:bg-green-100';
      case 'red':
        return 'bg-red-100 text-red-800 hover:bg-red-100';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
      case 'purple':
        return 'bg-purple-100 text-purple-800 hover:bg-purple-100';
      case 'pink':
        return 'bg-pink-100 text-pink-800 hover:bg-pink-100';
      case 'indigo':
        return 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
    }
  }
  
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <Badge 
          key={index} 
          variant="outline" 
          className={getBadgeClasses(item.color)}
        >
          {item.label}
        </Badge>
      ))}
    </div>
  );
}
