import { Text } from 'troika-three-text';
import * as THREE from 'three';

export interface TextOptions {
  text: string;
  fontSize?: number;
  color?: string;
  maxWidth?: number;
  textAlign?: 'left' | 'center' | 'right';
  anchorX?: 'left' | 'center' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom';
  fontWeight?: 'normal' | 'bold';
  letterSpacing?: number;
  lineHeight?: number;
  outlineWidth?: number;
  outlineColor?: string;
}

export function createText(options: TextOptions): any {
  const {
    text,
    fontSize = 0.12,
    color = '#e2e8f0',
    maxWidth,
    textAlign = 'left',
    anchorX = 'left',
    anchorY = 'top',
    fontWeight = 'normal',
    letterSpacing = 0,
    lineHeight = 1.4,
    outlineWidth = 0,
    outlineColor = '#000000',
  } = options;

  const textMesh = new Text();
  textMesh.text = text;
  textMesh.fontSize = fontSize;
  textMesh.color = color;
  textMesh.anchorX = anchorX;
  textMesh.anchorY = anchorY;
  textMesh.textAlign = textAlign;
  textMesh.letterSpacing = letterSpacing;
  textMesh.lineHeight = lineHeight;

  if (maxWidth) textMesh.maxWidth = maxWidth;
  if (fontWeight === 'bold') {
    textMesh.fontWeight = 'bold';
  }
  if (outlineWidth > 0) {
    textMesh.outlineWidth = outlineWidth;
    textMesh.outlineColor = outlineColor;
  }

  textMesh.sync();
  return textMesh;
}

export function createHeading(text: string, size: 'h1' | 'h2' | 'h3' = 'h1', color?: string): any {
  const sizes = { h1: 0.22, h2: 0.16, h3: 0.13 };
  return createText({
    text,
    fontSize: sizes[size],
    color: color || '#f1f5f9',
    fontWeight: 'bold',
    anchorX: 'left',
    anchorY: 'top',
  });
}

export function createLabel(text: string, color?: string): any {
  return createText({
    text: text.toUpperCase(),
    fontSize: 0.07,
    color: color || '#94a3b8',
    letterSpacing: 0.04,
    fontWeight: 'bold',
    anchorX: 'left',
    anchorY: 'top',
  });
}

export function createBody(text: string, maxWidth: number = 3, color?: string): any {
  return createText({
    text,
    fontSize: 0.09,
    color: color || '#cbd5e1',
    maxWidth,
    lineHeight: 1.5,
    anchorX: 'left',
    anchorY: 'top',
  });
}

export function updateText(textMesh: any, newText: string): void {
  textMesh.text = newText;
  textMesh.sync();
}
