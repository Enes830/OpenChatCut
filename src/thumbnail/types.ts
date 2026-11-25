export interface BlurBox {
  id: string;
  /** Percentage 0..100 from left of image */
  x: number;
  /** Percentage 0..100 from top of image */
  y: number;
  /** Percentage 0..100 width */
  width: number;
  /** Percentage 0..100 height */
  height: number;
  /** Gaussian blur sigma (4..36) */
  sigma: number;
  label?: string;
  category?: string;
}

export interface DynamicLayerSchema {
  id: string;
  type: 'text' | 'image' | string;
  object_key: string;
  default_content?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
}

export interface TemplateSchema {
  key: string;
  name: string;
  canvas_width: number;
  canvas_height: number;
  dynamic_layers: DynamicLayerSchema[];
}

export interface PalettePreset {
  name: string;
  bg_color: string;
  kicker_color: string;
  headline_color: string;
  kicker_text_color: string;
  headline_text_color: string;
}

export interface ThumbnailSchemaResponse {
  status: string;
  default_template: string;
  templates: TemplateSchema[];
  palettes: Record<string, PalettePreset>;
  kashida_template_ids: Record<string, string>;
}

export interface ThumbnailStateResponse {
  status: string;
  project_id: string;
  has_cover: boolean;
  cover_url: string | null;
  source_image_path: string | null;
  source_image_url: string | null;
  video_path: string | null;
  template_key: string;
  palette: string;
  dynamic_values: Record<string, string>;
  blur_boxes: BlurBox[];
  use_image_system: boolean;
  direct_replace: boolean;
  stroke_width: number;
  bg_color: string | null;
  updated_at: number;
}

export interface VideoFrameCandidate {
  frame_index: number;
  timestamp_sec: number;
  width: number;
  height: number;
  preview_base64: string;
}

export interface ThumbnailGeneratePayload {
  project_id: string;
  image_path?: string | null;
  video_path?: string | null;
  template_key: string;
  cover_color: string;
  dynamic_values: Record<string, string>;
  kicker_text?: string;
  headline_text?: string;
  blur_boxes: BlurBox[];
  use_image_system: boolean;
  direct_replace: boolean;
  stroke_width: number;
  auto_blur: boolean;
  save_state: boolean;
}

export interface ThumbnailGenerateResponse {
  status: string;
  source_kind: string;
  output_path: string | null;
  cover_url: string | null;
  size_bytes: number;
  dimensions: { width: number; height: number };
  state?: Partial<ThumbnailStateResponse>;
  detail?: string;
}
