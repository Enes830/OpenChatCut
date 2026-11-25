import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  fetchThumbnailSchema,
  fetchThumbnailState,
  fetchVideoFrames,
  generateThumbnail,
  runAutoBlur,
  selectVideoFrame,
  uploadThumbnailSource,
} from './api';
import { ThumbnailBlurCanvas } from './ThumbnailBlurCanvas';
import type {
  BlurBox,
  PalettePreset,
  TemplateSchema,
  ThumbnailSchemaResponse,
  VideoFrameCandidate,
} from './types';

type Lang = 'ar' | 'en';
type ProcessingMode = 'image_system' | 'template_only' | 'direct_replace';
type CanvasViewMode = 'blur' | 'final';

const STRINGS: Record<Lang, Record<string, string>> = {
  ar: {
    studioTitle: 'محرر الغلاف والتمويه',
    backToEditor: 'العودة لمحرر الفيديو',
    viewBlur: 'تحرير التمويه والمصدر',
    viewFinal: 'معاينة الغلاف النهائي',
    saveAndApply: 'حفظ وتحديث الغلاف',
    saving: 'جاري التوليد والحفظ...',
    downloadCover: 'تحميل الغلاف',
    loading: 'جاري تحميل بيانات الغلاف...',
    sourceSection: 'مصدر الصورة',
    uploadNew: 'رفع صورة جديدة',
    uploading: 'جاري الرفع...',
    uploadHint: 'اسحب صورة هنا أو اضغط للرفع (JPG / PNG / WebP)',
    pickFrame: 'اختيار لقطة من الفيديو',
    loadingFrames: 'جاري استخراج اللقطات...',
    processingMode: 'وضع المعالجة',
    modeImageSystem: 'معالجة ذكية + قالب',
    modeImageSystemDesc: 'قص ذكي للشخصية، إطار أبيض، تلوين الخلفية، ونصوص القالب',
    modeTemplateOnly: 'القالب بدون قص',
    modeTemplateOnlyDesc: 'استخدام الصورة كاملة مع التمويه ونصوص القالب',
    modeDirect: 'صورة جاهزة مباشرة',
    modeDirectDesc: 'استبدال الغلاف بالصورة المرفوعة مع التمويه فقط بدون نصوص',
    strokeWidth: 'سمك الإطار الأبيض',
    templateSection: 'القالب والألوان',
    templateLabel: 'قالب كشيدة',
    paletteLabel: 'لوحة الألوان',
    textSection: 'نصوص الغلاف',
    blurSection: 'نظام التمويه',
    autoBlurBtn: 'تشغيل التمويه التلقائي',
    autoBlurRunning: 'جاري فحص التمويه...',
    clearBlurBtn: 'مسح الكل',
    blurStrength: 'شدة التمويه',
    blurBoxPrefix: 'منطقة تمويه',
    noBlurBoxes: 'لا توجد مناطق تمويه. اسحب على الصورة لإضافة منطقة جديدة أو استخدم التمويه التلقائي.',
    canvasEmpty: 'ارفع صورة أو اختر لقطة من الفيديو للبدء',
    canvasHint: 'اسحب بالماوس على الصورة لإضافة منطقة تمويه — اسحب المنطقة لتحريكها أو الزاوية لتغيير حجمها',
    savedOk: 'تم تحديث الغلاف وحفظه في المشروع بنجاح',
    uploadedOk: 'تم رفع الصورة الجديدة بنجاح',
    frameSelectedOk: 'تم اختيار اللقطة من الفيديو',
    autoBlurNone: 'لم يتم العثور على شعارات أو نصوص تحتاج إلى تمويه',
    autoBlurFound: 'تم اكتشاف مناطق التمويه بنجاح',
    remove: 'حذف',
    layerKicker: 'العنوان العلوي',
    layerHeadline: 'العنوان الرئيسي',
  },
  en: {
    studioTitle: 'Thumbnail & Blur Studio',
    backToEditor: 'Back to Video Editor',
    viewBlur: 'Edit Blur & Source',
    viewFinal: 'Final Cover Preview',
    saveAndApply: 'Save & Update Cover',
    saving: 'Rendering & Saving...',
    downloadCover: 'Download Cover',
    loading: 'Loading thumbnail workspace...',
    sourceSection: 'Image Source',
    uploadNew: 'Upload New Image',
    uploading: 'Uploading...',
    uploadHint: 'Drop an image here or click to upload (JPG / PNG / WebP)',
    pickFrame: 'Pick Frame from Video',
    loadingFrames: 'Extracting frames...',
    processingMode: 'Processing Mode',
    modeImageSystem: 'Image System + Template',
    modeImageSystemDesc: 'Subject framing, MediaPipe cutout, white stroke, duotone, and typography',
    modeTemplateOnly: 'Template Only',
    modeTemplateOnlyDesc: 'Keep full photo with blur boxes and template typography',
    modeDirect: 'Direct Replace',
    modeDirectDesc: 'Use uploaded image directly with blur boxes only, no template overlay',
    strokeWidth: 'White Stroke Width',
    templateSection: 'Template & Palette',
    templateLabel: 'Kashida Template',
    paletteLabel: 'Brand Palette',
    textSection: 'Cover Text',
    blurSection: 'Blur System',
    autoBlurBtn: 'Run Auto-Blur',
    autoBlurRunning: 'Detecting watermarks...',
    clearBlurBtn: 'Clear All',
    blurStrength: 'Blur Strength',
    blurBoxPrefix: 'Blur Region',
    noBlurBoxes: 'No blur regions yet. Drag on the image to draw one, or run Auto-Blur.',
    canvasEmpty: 'Upload an image or pick a video frame to begin',
    canvasHint: 'Click and drag on the image to draw a blur box — drag to move or use the corner handle to resize',
    savedOk: 'Cover rendered and saved to project',
    uploadedOk: 'New source image uploaded',
    frameSelectedOk: 'Video frame selected',
    autoBlurNone: 'No watermarks or handles detected',
    autoBlurFound: 'Auto-blur regions detected',
    remove: 'Remove',
    layerKicker: 'Kicker / Top Line',
    layerHeadline: 'Main Headline',
  },
};

const PALETTE_LABELS_AR: Record<string, string> = {
  blue_navy: 'أزرق كحلي',
  crimson_grey: 'أحمر رمادي',
  teal_sage: 'تركواز',
  green_navy: 'أخضر داكن',
  purple_grey: 'بنفسجي',
  olive_pearl: 'زيتي فاتح',
};

function SvgIcon({ name, size = 15 }: { name: 'back' | 'upload' | 'film' | 'blur' | 'spark' | 'download' | 'trash' | 'check' | 'eye'; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { flexShrink: 0 },
  };
  switch (name) {
    case 'back':
      return <svg {...common}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>;
    case 'upload':
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
    case 'film':
      return <svg {...common}><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="7" y1="4" x2="7" y2="20" /><line x1="17" y1="4" x2="17" y2="20" /><line x1="2" y1="12" x2="22" y2="12" /></svg>;
    case 'blur':
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'spark':
      return <svg {...common}><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" /></svg>;
    case 'download':
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
    case 'trash':
      return <svg {...common}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>;
    case 'check':
      return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
    case 'eye':
      return <svg {...common}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
  }
}

export interface ThumbnailStudioProps {
  projectId: string;
  projectName?: string;
  onBackToEditor: () => void;
}

export default function ThumbnailStudio({
  projectId,
  projectName,
  onBackToEditor,
}: ThumbnailStudioProps) {
  const [lang, setLang] = useState<Lang>('ar');
  const s = STRINGS[lang];
  const isRtl = lang === 'ar';

  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<ThumbnailSchemaResponse | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [sourceImagePath, setSourceImagePath] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);

  const [templateKey, setTemplateKey] = useState('rassd_new_brand_thumbnail_template');
  const [palette, setPalette] = useState('blue_navy');
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [blurBoxes, setBlurBoxes] = useState<BlurBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [mode, setMode] = useState<ProcessingMode>('image_system');
  const [strokeWidth, setStrokeWidth] = useState(28);
  const [viewMode, setViewMode] = useState<CanvasViewMode>('blur');

  const [frames, setFrames] = useState<VideoFrameCandidate[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autoBlurring, setAutoBlurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotice(null);
    Promise.all([fetchThumbnailSchema(), fetchThumbnailState(projectId)])
      .then(([schemaRes, stateRes]) => {
        if (!alive) return;
        setSchema(schemaRes);
        setCoverUrl(stateRes.cover_url);
        setSourceImagePath(stateRes.source_image_path);
        setSourceImageUrl(stateRes.source_image_url);
        setVideoPath(stateRes.video_path);
        setTemplateKey(stateRes.template_key || schemaRes.default_template);
        setPalette(stateRes.palette || 'blue_navy');
        setDynamicValues(stateRes.dynamic_values || {});
        setBlurBoxes(
          (stateRes.blur_boxes || []).map((b, idx) => ({
            ...b,
            id: b.id || `box_${idx}_${Date.now()}`,
            sigma: b.sigma || 12,
          })),
        );
        if (stateRes.direct_replace) setMode('direct_replace');
        else if (!stateRes.use_image_system) setMode('template_only');
        else setMode('image_system');
        setStrokeWidth(stateRes.stroke_width ?? 28);
        setViewMode(stateRes.source_image_url ? 'blur' : 'final');
      })
      .catch((err) => {
        if (!alive) return;
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const activeTemplate: TemplateSchema | undefined = useMemo(() => {
    if (!schema?.templates?.length) return undefined;
    return schema.templates.find((t) => t.key === templateKey) || schema.templates[0];
  }, [schema, templateKey]);

  const textLayers = useMemo(() => {
    const layers = activeTemplate?.dynamic_layers?.filter((l) => l.type === 'text') || [];
    if (layers.length > 0) return layers;
    return [
      { id: 'kicker_tag_layer', type: 'text', object_key: 'kicker_tag', default_content: '' },
      { id: 'headline_layer', type: 'text', object_key: 'headline', default_content: '' },
    ];
  }, [activeTemplate]);

  const aspectRatio = useMemo(() => {
    if (!activeTemplate) return 9 / 16;
    return activeTemplate.canvas_width / Math.max(1, activeTemplate.canvas_height);
  }, [activeTemplate]);

  const selectedBox = useMemo(
    () => blurBoxes.find((b) => b.id === selectedBoxId) || null,
    [blurBoxes, selectedBoxId],
  );

  const labelForTextLayer = (key: string): string => {
    if (key === 'kicker_tag') return s.layerKicker;
    if (key === 'headline') return s.layerHeadline;
    return key.replace(/_/g, ' ');
  };

  const handleUploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setNotice(null);
      try {
        const res = await uploadThumbnailSource(projectId, file);
        setSourceImagePath(res.image_path);
        setSourceImageUrl(res.image_url);
        setViewMode('blur');
        setNotice({ kind: 'ok', text: s.uploadedOk });
      } catch (err) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setUploading(false);
      }
    },
    [projectId, s.uploadedOk],
  );

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUploadFile(file);
    e.target.value = '';
  };

  const onDropFile = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      void handleUploadFile(file);
    }
  };

  const handleLoadFrames = async () => {
    if (!videoPath) return;
    setLoadingFrames(true);
    setNotice(null);
    try {
      const res = await fetchVideoFrames(videoPath, 6);
      setFrames(res.frames || []);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoadingFrames(false);
    }
  };

  const handlePickFrame = async (timestampSec: number) => {
    if (!videoPath) return;
    setUploading(true);
    setNotice(null);
    try {
      const res = await selectVideoFrame(projectId, videoPath, timestampSec);
      setSourceImagePath(res.image_path);
      setSourceImageUrl(res.image_url);
      setViewMode('blur');
      setNotice({ kind: 'ok', text: s.frameSelectedOk });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleAutoBlur = async () => {
    setAutoBlurring(true);
    setNotice(null);
    try {
      const res = await runAutoBlur({
        project_id: projectId,
        image_path: sourceImagePath,
        video_path: videoPath,
      });
      const detected = (res.boxes || []).map((b, idx) => ({
        ...b,
        id: b.id || `auto_${idx}_${Date.now()}`,
        sigma: b.sigma || 12,
      }));
      if (detected.length === 0) {
        setNotice({ kind: 'ok', text: s.autoBlurNone });
      } else {
        setBlurBoxes((prev) => [...prev, ...detected]);
        setSelectedBoxId(detected[0].id);
        setViewMode('blur');
        setNotice({ kind: 'ok', text: `${s.autoBlurFound} (${detected.length})` });
      }
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setAutoBlurring(false);
    }
  };

  const handleSaveAndRender = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await generateThumbnail({
        project_id: projectId,
        image_path: sourceImagePath,
        video_path: videoPath,
        template_key: templateKey,
        cover_color: palette,
        dynamic_values: dynamicValues,
        kicker_text: dynamicValues.kicker_tag,
        headline_text: dynamicValues.headline,
        blur_boxes: blurBoxes,
        use_image_system: mode === 'image_system',
        direct_replace: mode === 'direct_replace',
        stroke_width: strokeWidth,
        auto_blur: false,
        save_state: true,
      });
      if (res.cover_url) setCoverUrl(res.cover_url);
      if (res.state?.source_image_path) setSourceImagePath(res.state.source_image_path);
      if (res.state?.source_image_url) setSourceImageUrl(res.state.source_image_url);
      setViewMode('final');
      setNotice({ kind: 'ok', text: s.savedOk });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const updateSelectedSigma = (sigma: number) => {
    if (!selectedBoxId) return;
    setBlurBoxes((prev) => prev.map((b) => (b.id === selectedBoxId ? { ...b, sigma } : b)));
  };

  const paletteList: PalettePreset[] = useMemo(() => {
    if (!schema?.palettes) return [];
    return Object.values(schema.palettes);
  }, [schema]);

  const activeCanvasImage = viewMode === 'final' ? (coverUrl || sourceImageUrl) : (sourceImageUrl || coverUrl);

  if (loading) {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{
          height: '100vh',
          background: '#0b0d11',
          color: '#cbd5e1',
          display: 'grid',
          placeItems: 'center',
          fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        {s.loading}
      </div>
    );
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateRows: '56px 1fr',
        background: '#0b0d11',
        color: '#f1f5f9',
        fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: '#11141b',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button
            type="button"
            onClick={onBackToEditor}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: '#181c26',
              color: '#e2e8f0',
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SvgIcon name="back" size={14} />
            <span>{s.backToEditor}</span>
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.studioTitle}
            </div>
            <div style={{ fontSize: 11.5, color: '#8b95a7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {projectName || projectId}
            </div>
          </div>
        </div>

        {/* Center View Mode Switcher */}
        <div
          style={{
            display: 'inline-flex',
            background: '#0b0d11',
            padding: 3,
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.09)',
            gap: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('blur')}
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 7,
              border: 'none',
              background: viewMode === 'blur' ? '#2881E2' : 'transparent',
              color: viewMode === 'blur' ? '#ffffff' : '#94a3b8',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SvgIcon name="blur" size={14} />
            <span>{s.viewBlur}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('final')}
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 7,
              border: 'none',
              background: viewMode === 'final' ? '#2881E2' : 'transparent',
              color: viewMode === 'final' ? '#ffffff' : '#94a3b8',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SvgIcon name="eye" size={14} />
            <span>{s.viewFinal}</span>
          </button>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
            style={{
              height: 34,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: '#cbd5e1',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {lang === 'ar' ? 'EN' : 'عربي'}
          </button>

          {coverUrl && (
            <a
              href={coverUrl}
              download={`cover_${projectId}.jpg`}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#181c26',
                color: '#e2e8f0',
                fontSize: 12.5,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SvgIcon name="download" size={14} />
              <span>{s.downloadCover}</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => void handleSaveAndRender()}
            disabled={saving || (!sourceImagePath && !videoPath)}
            style={{
              height: 34,
              padding: '0 16px',
              borderRadius: 8,
              border: 'none',
              background: saving ? '#1e4d82' : '#2881E2',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              opacity: !sourceImagePath && !videoPath ? 0.5 : 1,
            }}
          >
            <SvgIcon name="check" size={14} />
            <span>{saving ? s.saving : s.saveAndApply}</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Control Sidebar */}
        <aside
          style={{
            background: '#11141b',
            borderInlineEnd: '1px solid rgba(255,255,255,0.08)',
            overflowY: 'auto',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {notice && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12.5,
                lineHeight: 1.5,
                background: notice.kind === 'error' ? 'rgba(220, 38, 38, 0.14)' : 'rgba(22, 163, 74, 0.14)',
                border: `1px solid ${notice.kind === 'error' ? 'rgba(220, 38, 38, 0.4)' : 'rgba(34, 197, 94, 0.35)'}`,
                color: notice.kind === 'error' ? '#fca5a5' : '#86efac',
              }}
            >
              {notice.text}
            </div>
          )}

          {/* Section 1: Image Source & Processing Mode */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>{s.sourceSection}</div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDropFile}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `1.5px dashed ${dragOver ? '#2881E2' : 'rgba(255,255,255,0.16)'}`,
                background: dragOver ? 'rgba(40,129,226,0.1)' : '#161a23',
                borderRadius: 10,
                padding: '14px 12px',
                textAlign: 'center',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SvgIcon name="upload" size={18} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                {uploading ? s.uploading : s.uploadNew}
              </div>
              <div style={{ fontSize: 11.5, color: '#8b95a7' }}>{s.uploadHint}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileInputChange}
                style={{ display: 'none' }}
              />
            </div>

            {videoPath && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void handleLoadFrames()}
                  disabled={loadingFrames}
                  style={secondaryBtnStyle}
                >
                  <SvgIcon name="film" size={14} />
                  <span>{loadingFrames ? s.loadingFrames : s.pickFrame}</span>
                </button>

                {frames.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {frames.map((fr) => (
                      <button
                        key={fr.frame_index}
                        type="button"
                        onClick={() => void handlePickFrame(fr.timestamp_sec)}
                        style={{
                          position: 'relative',
                          padding: 0,
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          overflow: 'hidden',
                          background: '#0b0d11',
                          cursor: 'pointer',
                          aspectRatio: '9 / 12',
                        }}
                      >
                        <img
                          src={`data:image/jpeg;base64,${fr.preview_base64}`}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 3,
                            right: 3,
                            background: 'rgba(0,0,0,0.75)',
                            color: '#ffffff',
                            fontSize: 10,
                            padding: '1px 4px',
                            borderRadius: 3,
                          }}
                        >
                          {fr.timestamp_sec}s
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Processing Mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div style={fieldLabelStyle}>{s.processingMode}</div>
              {(
                [
                  { id: 'image_system', title: s.modeImageSystem, desc: s.modeImageSystemDesc },
                  { id: 'template_only', title: s.modeTemplateOnly, desc: s.modeTemplateOnlyDesc },
                  { id: 'direct_replace', title: s.modeDirect, desc: s.modeDirectDesc },
                ] as const
              ).map((opt) => {
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    style={{
                      textAlign: isRtl ? 'right' : 'left',
                      padding: '9px 11px',
                      borderRadius: 8,
                      border: active ? '1.5px solid #2881E2' : '1px solid rgba(255,255,255,0.1)',
                      background: active ? 'rgba(40, 129, 226, 0.14)' : '#161a23',
                      color: '#f1f5f9',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{opt.title}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>

            {mode === 'image_system' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1' }}>
                  <span>{s.strokeWidth}</span>
                  <span>{strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={2}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#2881E2' }}
                />
              </div>
            )}
          </section>

          {/* Section 2: Template & Brand Palette (hidden in direct_replace mode) */}
          {mode !== 'direct_replace' && (
            <>
              <section style={sectionStyle}>
                <div style={sectionTitleStyle}>{s.templateSection}</div>

                {schema && schema.templates.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={fieldLabelStyle}>{s.templateLabel}</label>
                    <select
                      value={templateKey}
                      onChange={(e) => setTemplateKey(e.target.value)}
                      style={inputStyle}
                    >
                      {schema.templates.map((tpl) => (
                        <option key={tpl.key} value={tpl.key} style={{ background: '#161a23', color: '#f1f5f9' }}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {paletteList.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={fieldLabelStyle}>{s.paletteLabel}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
                      {paletteList.map((p) => {
                        const active = palette === p.name;
                        return (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => setPalette(p.name)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '7px 9px',
                              borderRadius: 8,
                              border: active ? '1.5px solid #2881E2' : '1px solid rgba(255,255,255,0.1)',
                              background: active ? 'rgba(40,129,226,0.14)' : '#161a23',
                              color: '#f1f5f9',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            <span style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }}>
                              <span style={{ width: 12, height: 16, background: p.kicker_color, display: 'block' }} />
                              <span style={{ width: 12, height: 16, background: p.headline_color, display: 'block' }} />
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lang === 'ar' ? (PALETTE_LABELS_AR[p.name] || p.name) : p.name.replace(/_/g, ' ')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Section 3: Schema-Driven Dynamic Text Fields */}
              <section style={sectionStyle}>
                <div style={sectionTitleStyle}>{s.textSection}</div>
                {textLayers.map((layer) => {
                  const key = layer.object_key;
                  const val = dynamicValues[key] ?? '';
                  return (
                    <div key={layer.id || key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label style={fieldLabelStyle}>{labelForTextLayer(key)}</label>
                      <textarea
                        rows={2}
                        value={val}
                        dir="auto"
                        onChange={(e) =>
                          setDynamicValues((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={layer.default_content || ''}
                        style={{
                          ...inputStyle,
                          resize: 'vertical',
                          minHeight: 54,
                          lineHeight: 1.5,
                        }}
                      />
                    </div>
                  );
                })}
              </section>
            </>
          )}

          {/* Section 4: Blur System */}
          <section style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={sectionTitleStyle}>{s.blurSection}</div>
              {blurBoxes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setBlurBoxes([]);
                    setSelectedBoxId(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {s.clearBlurBtn}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleAutoBlur()}
              disabled={autoBlurring || (!sourceImagePath && !videoPath)}
              style={secondaryBtnStyle}
            >
              <SvgIcon name="spark" size={14} />
              <span>{autoBlurring ? s.autoBlurRunning : s.autoBlurBtn}</span>
            </button>

            {selectedBox && (
              <div
                style={{
                  padding: '10px 11px',
                  borderRadius: 8,
                  background: '#161a23',
                  border: '1px solid rgba(40,129,226,0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1' }}>
                  <span>{s.blurStrength}</span>
                  <span>{selectedBox.sigma}</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={36}
                  step={1}
                  value={selectedBox.sigma}
                  onChange={(e) => updateSelectedSigma(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#2881E2' }}
                />
              </div>
            )}

            {blurBoxes.length === 0 ? (
              <div style={{ fontSize: 12, color: '#8b95a7', lineHeight: 1.5 }}>{s.noBlurBoxes}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {blurBoxes.map((box, idx) => {
                  const active = box.id === selectedBoxId;
                  return (
                    <div
                      key={box.id}
                      onClick={() => {
                        setSelectedBoxId(box.id);
                        setViewMode('blur');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 10px',
                        borderRadius: 8,
                        border: active ? '1px solid #2881E2' : '1px solid rgba(255,255,255,0.08)',
                        background: active ? 'rgba(40,129,226,0.12)' : '#161a23',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: '#e2e8f0' }}>
                        {s.blurBoxPrefix} #{idx + 1}
                        {box.label ? ` — ${box.label}` : ''}
                      </span>
                      <button
                        type="button"
                        aria-label={s.remove}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBlurBoxes((prev) => prev.filter((b) => b.id !== box.id));
                          if (selectedBoxId === box.id) setSelectedBoxId(null);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: 2,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <SvgIcon name="trash" size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        {/* Center Canvas Stage */}
        <main
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'radial-gradient(circle at center, #141925 0%, #0b0d11 75%)',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <ThumbnailBlurCanvas
            imageUrl={activeCanvasImage}
            aspectRatio={aspectRatio}
            blurBoxes={blurBoxes}
            selectedBoxId={selectedBoxId}
            editable={viewMode === 'blur'}
            defaultSigma={12}
            emptyLabel={s.canvasEmpty}
            hintLabel={s.canvasHint}
            onSelectBox={setSelectedBoxId}
            onChangeBoxes={setBlurBoxes}
          />
        </main>
      </div>
    </div>
  );
}

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
  paddingBottom: 14,
  borderBottom: '1px solid rgba(255,255,255,0.07)',
};

const sectionTitleStyle = {
  fontSize: 12.5,
  fontWeight: 700,
  color: '#e2e8f0',
  letterSpacing: '0.01em',
};

const fieldLabelStyle = {
  fontSize: 11.5,
  color: '#94a3b8',
  fontWeight: 500,
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#161a23',
  color: '#f8fafc',
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
  outline: 'none',
};

const secondaryBtnStyle = {
  height: 34,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#181c26',
  color: '#e2e8f0',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  width: '100%',
};
