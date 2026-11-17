import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterButtonProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export default function FilterButton({ 
  children, 
  active = false, 
  onClick 
}: FilterButtonProps) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        "mb-2",
        active ? "bg-accent text-white hover:bg-accent/90" : ""
      )}
    >
      {children}
    </Button>
  );
}
