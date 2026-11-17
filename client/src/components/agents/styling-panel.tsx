import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface StylingPanelProps {
  primaryColor: string;
  bubbleStyle: 'rounded' | 'square' | 'pill';
  showAgentDescription: boolean;
  onPrimaryColorChange: (color: string) => void;
  onBubbleStyleChange: (style: 'rounded' | 'square' | 'pill') => void;
  onShowAgentDescriptionChange: (show: boolean) => void;
}

const colorOptions = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Teal', value: '#14b8a6' },
];

export default function StylingPanel({
  primaryColor,
  bubbleStyle,
  showAgentDescription,
  onPrimaryColorChange,
  onBubbleStyleChange,
  onShowAgentDescriptionChange
}: StylingPanelProps) {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle className="text-lg">Styling Options</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Primary Color */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Primary Color</Label>
          <div className="grid grid-cols-4 gap-2">
            {colorOptions.map((color) => (
              <button
                key={color.value}
                className={`w-8 h-8 rounded-md border-2 ${
                  primaryColor === color.value ? 'border-gray-900' : 'border-gray-200'
                }`}
                style={{ backgroundColor: color.value }}
                onClick={() => onPrimaryColorChange(color.value)}
                title={color.name}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Bubble Style */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Message Bubble Style</Label>
          <Select value={bubbleStyle} onValueChange={onBubbleStyleChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rounded">Rounded</SelectItem>
              <SelectItem value="square">Square</SelectItem>
              <SelectItem value="pill">Pill</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Show Agent Description */}
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Show Agent Description</Label>
          <Switch
            checked={showAgentDescription}
            onCheckedChange={onShowAgentDescriptionChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}