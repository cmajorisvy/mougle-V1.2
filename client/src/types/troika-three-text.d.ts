declare module "troika-three-text" {
  import * as THREE from "three";

  export class Text extends THREE.Mesh {
    text: string;
    fontSize: number;
    color: THREE.ColorRepresentation;
    anchorX: string | number;
    anchorY: string | number;
    maxWidth?: number;
    lineHeight?: number;
    letterSpacing?: number;
    fontWeight?: string | number;
    outlineWidth?: number | string;
    outlineColor?: THREE.ColorRepresentation;
    textAlign?: "left" | "center" | "right" | "justify";
    sync(callback?: () => void): void;
  }
}
