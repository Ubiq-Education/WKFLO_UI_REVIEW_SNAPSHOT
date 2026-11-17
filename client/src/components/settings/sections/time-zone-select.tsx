import { useMemo } from "react";
import { Combobox } from "@/components/ui/combobox";
import { getTimeZoneOptions, toTimeZoneOption } from "@/lib/time-zones";

interface TimeZoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  // Injected by <FormControl> so the field's label/description/error point at the trigger.
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export default function TimeZoneSelect({ value, onChange, ...rest }: TimeZoneSelectProps) {
  const options = useMemo(() => {
    const all = getTimeZoneOptions();
    // A saved zone this browser doesn't list (e.g. a legacy alias) must still show as selected.
    return !value || all.some((option) => option.value === value)
      ? all
      : [toTimeZoneOption(value, new Date()), ...all];
  }, [value]);

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onChange}
      placeholder="Select a time zone"
      searchPlaceholder="Search time zones..."
      emptyText="No time zone found."
      className="w-full md:w-[420px]"
      {...rest}
    />
  );
}
