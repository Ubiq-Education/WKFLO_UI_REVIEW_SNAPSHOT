import { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

interface RawJsonConfigEditorProps {
  form: UseFormReturn<any>;
}

/** Fallback raw-JSON textarea used for any tool type without a dedicated config editor. */
export default function RawJsonConfigEditor({ form }: RawJsonConfigEditorProps) {
  return (
    <FormField
      control={form.control}
      name="config"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Configuration</FormLabel>
          <FormControl>
            <Textarea
              placeholder="Tool configuration in JSON format..."
              className="min-h-[200px] font-mono"
              {...field}
            />
          </FormControl>
          <FormDescription>
            Enter configuration for the tool in JSON format.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
