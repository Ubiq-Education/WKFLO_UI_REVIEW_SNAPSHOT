import { Loader2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { NumberStepperInput } from "@/components/ui/number-stepper-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { AICreditFormProps } from "./ai-credit-form.types";

export default function AICreditForm({ form, onSubmit, isSubmitting, isEditMode }: AICreditFormProps) {
  // Live client-side preview only - the persisted totalCost/credits always come from the
  // server response after save (they're computed there, e.g. via getValues() they'd be stale).
  const tokensIn = form.watch("tokensIn") ?? 0;
  const costInMTok = form.watch("costInMTok") ?? 0;
  const tokensOut = form.watch("tokensOut") ?? 0;
  const costOutMTok = form.watch("costOutMTok") ?? 0;
  const multiplierIn = form.watch("multiplierIn") ?? 0;
  const multiplierOut = form.watch("multiplierOut") ?? 0;

  const totalCostPreview = (Number(costInMTok) || 0) + (Number(costOutMTok) || 0);
  const creditsPreview =
    ((Number(tokensIn) || 0) * (Number(multiplierIn) || 0)) / 1000 +
    ((Number(tokensOut) || 0) * (Number(multiplierOut) || 0)) / 1000;

  return (
    <Card className="border-border">
      <CardContent className="py-6 px-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="tokensIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tokens In</FormLabel>
                    <FormControl>
                      <NumberStepperInput
                        value={field.value ?? null}
                        onChange={field.onChange}
                        min={0}
                        step={1}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="costInMTok"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost In ($ per 1M tokens)</FormLabel>
                    <FormControl>
                      <NumberStepperInput
                        value={field.value ?? null}
                        onChange={field.onChange}
                        min={0}
                        step={0.01}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tokensOut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tokens Out</FormLabel>
                    <FormControl>
                      <NumberStepperInput
                        value={field.value ?? null}
                        onChange={field.onChange}
                        min={0}
                        step={1}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="costOutMTok"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Out ($ per 1M tokens)</FormLabel>
                    <FormControl>
                      <NumberStepperInput
                        value={field.value ?? null}
                        onChange={field.onChange}
                        min={0}
                        step={0.01}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="multiplierIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Multiplier In</FormLabel>
                    <FormControl>
                      {/* min is 0 (not the server's exclusive floor of "> 0") so 0 itself can
                          actually be entered and surface the Zod message below, instead of the
                          stepper silently clamping it back up. Fractional values like 0.01 are
                          valid and intentional - they're not a floor, they're the point. */}
                      <NumberStepperInput
                        value={field.value ?? null}
                        onChange={field.onChange}
                        min={0}
                        step={0.01}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="multiplierOut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Multiplier Out</FormLabel>
                    <FormControl>
                      <NumberStepperInput
                        value={field.value ?? null}
                        onChange={field.onChange}
                        min={0}
                        step={0.01}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cost (preview)</p>
                <p className="text-lg font-semibold">${totalCostPreview.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Credits (preview)</p>
                <p className="text-lg font-semibold">{creditsPreview.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : isEditMode ? (
                  <>Update AI Credit</>
                ) : (
                  <>Create AI Credit</>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
