import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { Icon, type IconName } from '../components/icons';
import { theme, themeAlpha } from '../theme';
import {
  fetchThumbnailState,
  generateThumbnail,
  uploadThumbnailSource,
} from './api';
import { ThumbnailBlurCanvas } from './ThumbnailBlurCanvas';
import type { BlurBox } from './types';

interface ColorTemplateOption {
  key: 'blue_navy' | 'crimson_grey' | 'teal_sage' | 'green_navy';
  templateId: string;
  label: string;
  kickerColor: string;
  headlineColor: string;
}

const KASHIDA_COLOR_TEMPLATES: ColorTemplateOption[] = [
  {
    key: 'blue_navy',
    templateId: '0dc042ab-1bcf-4b4f-8b44-1103202cebd2',
    label: 'أزرق',
    kickerColor: '#2881E2',
    headlineColor: '#15181D',
  },
  {
    key: 'crimson_grey',
    templateId: '105299dd-d358-4f79-a1ed-e6dabf43f4c0',
    label: 'أحمر',
    kickerColor: '#A02426',
    headlineColor: '#B7B9BB',
  },
  {
    key: 'teal_sage',
    templateId: '1b899df3-f83d-49b2-b93e-185767125598',
    label: 'تركواز',
    kickerColor: '#057F76',
    headlineColor: '#DFE4D2',
  },
  {
    key: 'green_navy',
    templateId: 'cac8f105-a51e-491a-8bf3-6da423f7932a',
    label: 'أخضر',
    kickerColor: '#15803D',
    headlineColor: '#15181D',
  },
];

const FONT_SIZE_PRESETS = [
  { label: 'صغير', val: 84 },
  { label: 'متوسط', val: 106 },
  { label: 'كبير', val: 126 },
];

const BLUR_STRENGTH_PRESETS = [
  { label: 'خفيف', val: 35 },
  { label: 'متوسط', val: 55 },
  { label: 'قوي', val: 75 },
  { label: 'شديد', val: 110 },
];

type SectionKey = 'photo' | 'text' | 'fontSize' | 'color' | 'blur';

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
  const [loading, setLoading] = useState(true);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [sourceImagePath, setSourceImagePath] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);

  const [palette, setPalette] = useState<string>('blue_navy');
  const [kickerText, setKickerText] = useState<string>('');
  const [headlineText, setHeadlineText] = useState<string>('');
  const [fontSize, setFontSize] = useState<number>(106);
  const [blurBoxes, setBlurBoxes] = useState<BlurBox[]>([]);
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    photo: true,
    color: true,
    text: true,
    fontSize: true,
    blur: true,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotice(null);
    fetchThumbnailState(projectId)
      .then((stateRes) => {
        if (!alive) return;
        setCoverUrl(stateRes.cover_url || stateRes.source_image_url);
        setSourceImagePath(stateRes.source_image_path);
        setVideoPath(stateRes.video_path);
        const matchedPalette = KASHIDA_COLOR_TEMPLATES.find((p) => p.key === stateRes.palette);
        setPalette(matchedPalette ? matchedPalette.key : 'blue_navy');
        setKickerText(stateRes.dynamic_values?.kicker_tag || '');
        setHeadlineText(stateRes.dynamic_values?.headline || '');
        setFontSize(stateRes.font_size ?? 106);
        setBlurBoxes(
          (stateRes.blur_boxes || []).map((b, idx) => ({
            ...b,
            id: b.id || `blur_${idx}_${Date.now()}`,
            sigma: b.sigma || 24,
            strength: b.strength ?? Math.max(20, Math.min(130, Math.round((b.sigma || 24) / 0.35))),
            shape: b.shape || 'square',
            borderRadius: b.borderRadius ?? 0,
          })),
        );
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

  const runRender = useCallback(
    async (overrides?: {
      imagePath?: string | null;
      paletteKey?: string;
      kicker?: string;
      headline?: string;
      nextFontSize?: number;
      nextBlurBoxes?: BlurBox[];
      successText?: string;
    }) => {
      const nextPalette = overrides?.paletteKey ?? palette;
      const tpl = KASHIDA_COLOR_TEMPLATES.find((t) => t.key === nextPalette) || KASHIDA_COLOR_TEMPLATES[0];
      const nextKicker = overrides?.kicker ?? kickerText;
      const nextHeadline = overrides?.headline ?? headlineText;
      const nextFont = overrides?.nextFontSize ?? fontSize;
      const nextBoxes = overrides?.nextBlurBoxes ?? blurBoxes;
      const nextImagePath = overrides?.imagePath !== undefined ? overrides.imagePath : sourceImagePath;

      setSaving(true);
      setNotice(null);
      try {
        const res = await generateThumbnail({
          project_id: projectId,
          image_path: nextImagePath,
          video_path: videoPath,
          template_key: 'rassd_new_brand_thumbnail_template',
          template_id: tpl.templateId,
          cover_color: tpl.key,
          dynamic_values: {
            kicker_tag: nextKicker,
            headline: nextHeadline,
          },
          kicker_text: nextKicker,
          headline_text: nextHeadline,
          font_size: nextFont,
          blur_boxes: nextBoxes,
          use_image_system: true,
          direct_replace: false,
          stroke_width: 28,
          auto_blur: false,
          save_state: true,
        });
        if (res.cover_url) {
          setCoverUrl(`${res.cover_url}${res.cover_url.includes('?') ? '&' : '?'}t=${Date.now()}`);
        }
        if (overrides?.successText) {
          setNotice({ kind: 'ok', text: overrides.successText });
        }
      } catch (err) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setSaving(false);
      }
    },
    [projectId, sourceImagePath, videoPath, palette, kickerText, headlineText, fontSize, blurBoxes],
  );

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const uploaded = await uploadThumbnailSource(projectId, file);
      setSourceImagePath(uploaded.image_path);
      await runRender({
        imagePath: uploaded.image_path,
        successText: 'تم رفع الصورة وتحديث الغلاف',
      });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleSelectColor = (tpl: ColorTemplateOption) => {
    setPalette(tpl.key);
    void runRender({
      paletteKey: tpl.key,
      successText: `تم تطبيق لون القالب: ${tpl.label}`,
    });
  };

  const handleAddBlur = () => {
    const newId = `blur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const offset = (blurBoxes.length % 4) * 3;
    const newBox: BlurBox = {
      id: newId,
      x: 34 + offset,
      y: 38 + offset,
      width: 30,
      height: 14,
      sigma: 24,
      strength: 70,
      shape: 'square',
      borderRadius: 0,
    };
    setBlurBoxes((prev) => [...prev, newBox]);
    setSelectedBlurId(newId);
  };

  const handleRemoveBlur = (id: string) => {
    setBlurBoxes((prev) => prev.filter((b) => b.id !== id));
    if (selectedBlurId === id) setSelectedBlurId(null);
  };

  const handleUpdateBlur = (updated: BlurBox) => {
    const nextStrength = updated.strength ?? 70;
    const normalized: BlurBox = {
      ...updated,
      strength: nextStrength,
      sigma: Math.max(4, Math.round(nextStrength * 0.35)),
    };
    setBlurBoxes((prev) => prev.map((b) => (b.id === normalized.id ? normalized : b)));
  };

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const cardContainerStyle = (isOpen: boolean): CSSProperties => ({
    borderRadius: 9,
    border: `0.5px solid ${theme.border}`,
    background: theme.panelAlt,
    overflow: 'hidden',
    flexShrink: 0,
    transition: 'border-color 0.15s ease',
    ...(isOpen ? {} : {}),
  });

  const renderCardHeader = (key: SectionKey, iconName: IconName, title: string) => {
    const isOpen = openSections[key];
    return (
      <button
        type="button"
        onClick={() => toggleSection(key)}
        style={{
          width: '100%',
          height: 38,
          padding: '0 12px',
          border: 'none',
          borderBottom: isOpen ? `0.5px solid ${theme.border}` : 'none',
          background: 'transparent',
          color: theme.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Icon name={iconName} size={14} color={theme.accent} />
          <span>{title}</span>
        </span>
        <span
          style={{
            display: 'inline-flex',
            transform: isOpen ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          <Icon name="chevronDown" size={13} color={theme.textDim} />
        </span>
      </button>
    );
  };

  const targetBlur =
    blurBoxes.find((r) => r.id === selectedBlurId) ?? (blurBoxes.length === 1 ? blurBoxes[0] : null);

  return (
    <div
      dir="ltr"
      style={{
        height: '100vh',
        width: '100vw',
        display: 'grid',
        gridTemplateRows: '48px 1fr',
        gridTemplateColumns: '1fr 340px',
        background: theme.bg,
        color: theme.text,
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
      {/* Top Bar matching SimpleTopBar */}
      <header
        dir="rtl"
        style={{
          gridColumn: '1 / -1',
          gridRow: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          borderBottom: `0.5px solid ${theme.border}`,
          background: theme.panel,
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            type="button"
            onClick={onBackToEditor}
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 6,
              border: `0.5px solid ${theme.border}`,
              background: theme.panelAlt,
              color: theme.text,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="home" size={13} />
            <span>العودة للمحرر</span>
          </button>

          <span style={{ width: 1, height: 18, background: theme.border }} />

          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              background: themeAlpha.accent(0.14),
              color: theme.accent,
            }}
          >
            محرر الغلاف
          </span>

          {projectName && (
            <span
              style={{
                fontSize: 12,
                color: theme.textDim,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {projectName}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {notice && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 6,
                background: notice.kind === 'error' ? 'rgba(239, 68, 68, 0.14)' : 'rgba(34, 197, 94, 0.14)',
                color: notice.kind === 'error' ? '#f87171' : '#4ade80',
                border: `0.5px solid ${notice.kind === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.35)'}`,
              }}
            >
              {notice.text}
            </span>
          )}

          <button
            type="button"
            disabled={saving || uploading}
            onClick={() => void runRender({ successText: 'تم حفظ وتحديث الغلاف بنجاح' })}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 7,
              border: '1px solid rgba(59, 130, 246, 0.45)',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              cursor: saving || uploading ? 'wait' : 'pointer',
              opacity: saving || uploading ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="check" size={13} />
            <span>{saving ? 'جاري التحديث...' : 'حفظ التعديلات'}</span>
          </button>
        </div>
      </header>

      {/* Center Preview Canvas */}
      <main
        style={{
          gridColumn: 1,
          gridRow: 2,
          background: theme.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {loading ? (
          <div style={{ color: theme.textDim, fontSize: 13 }}>جاري تحميل الغلاف...</div>
        ) : (
          <ThumbnailBlurCanvas
            imageUrl={coverUrl}
            aspectRatio={9 / 16}
            blurBoxes={blurBoxes}
            selectedBoxId={selectedBlurId}
            editable={true}
            busy={saving || uploading}
            emptyLabel="ارفع صورة للبدء"
            onSelectBox={setSelectedBlurId}
            onChangeBoxes={setBlurBoxes}
          />
        )}
      </main>

      {/* Right Control Panel — Simple Editor Style */}
      <aside
        dir="rtl"
        style={{
          gridColumn: 2,
          gridRow: 2,
          background: theme.panel,
          borderLeft: `0.5px solid ${theme.border}`,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* 1. Upload Photo */}
        <div style={cardContainerStyle(openSections.photo)}>
          {renderCardHeader('photo', 'image', 'صورة الغلاف')}
          {openSections.photo && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                disabled={uploading || saving}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 7,
                  border: `0.5px solid ${theme.border}`,
                  background: theme.bg,
                  color: theme.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: uploading || saving ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
              >
                <Icon name="upload" size={14} color={theme.accent} />
                <span>{uploading ? 'جاري الرفع...' : 'رفع صورة جديدة'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. Change Color (4 Kashida Templates) */}
        <div style={cardContainerStyle(openSections.color)}>
          {renderCardHeader('color', 'palette', 'لون القالب')}
          {openSections.color && (
            <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {KASHIDA_COLOR_TEMPLATES.map((tpl) => {
                const active = palette === tpl.key;
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    disabled={saving || uploading}
                    onClick={() => handleSelectColor(tpl)}
                    style={{
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 7,
                      border: `1px solid ${active ? '#3b82f6' : theme.border}`,
                      background: active ? 'rgba(59, 130, 246, 0.16)' : theme.bg,
                      color: active ? '#60a5fa' : theme.text,
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      cursor: saving || uploading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span>{tpl.label}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: tpl.kickerColor,
                          border: '1px solid rgba(255,255,255,0.2)',
                        }}
                      />
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: tpl.headlineColor,
                          border: '1px solid rgba(255,255,255,0.2)',
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Change Text */}
        <div style={cardContainerStyle(openSections.text)}>
          {renderCardHeader('text', 'text', 'نص الغلاف')}
          {openSections.text && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11, color: theme.textDim, fontWeight: 600 }}>
                  العنوان العلوي
                </label>
                <input
                  type="text"
                  value={kickerText}
                  onChange={(e) => setKickerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void runRender({ successText: 'تم تحديث النص' });
                    }
                  }}
                  placeholder="أدخل العنوان العلوي..."
                  style={{
                    height: 34,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: `0.5px solid ${theme.border}`,
                    background: theme.bg,
                    color: theme.text,
                    fontSize: 12.5,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11, color: theme.textDim, fontWeight: 600 }}>
                  العنوان الرئيسي
                </label>
                <textarea
                  rows={2}
                  value={headlineText}
                  onChange={(e) => setHeadlineText(e.target.value)}
                  placeholder="أدخل العنوان الرئيسي..."
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: `0.5px solid ${theme.border}`,
                    background: theme.bg,
                    color: theme.text,
                    fontSize: 12.5,
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <button
                type="button"
                disabled={saving || uploading}
                onClick={() => void runRender({ successText: 'تم تحديث النص' })}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 7,
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: saving || uploading ? 'wait' : 'pointer',
                  opacity: saving || uploading ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Icon name="check" size={13} />
                <span>{saving ? 'جاري التحديث...' : 'تحديث'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. Change Font Size */}
        <div style={cardContainerStyle(openSections.fontSize)}>
          {renderCardHeader('fontSize', 'sliders', 'حجم الخط')}
          {openSections.fontSize && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: theme.textDim, fontWeight: 600 }}>حجم خط العنوان</span>
                <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>{fontSize}px</span>
              </div>
              <input
                type="range"
                min={64}
                max={140}
                step={2}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                onPointerUp={() => void runRender({ nextFontSize: fontSize, successText: 'تم تحديث حجم الخط' })}
                style={{ width: '100%', accentColor: '#3b82f6', height: 4 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {FONT_SIZE_PRESETS.map((preset) => {
                  const active = fontSize === preset.val;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={saving || uploading}
                      onClick={() => {
                        setFontSize(preset.val);
                        void runRender({ nextFontSize: preset.val, successText: 'تم تحديث حجم الخط' });
                      }}
                      style={{
                        height: 26,
                        borderRadius: 5,
                        border: `1px solid ${active ? '#3b82f6' : theme.border}`,
                        background: active ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: active ? '#60a5fa' : theme.text,
                        fontSize: 10.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 5. Add Blur — Exact Simple Editor Style (Zero Emojis) */}
        <div style={cardContainerStyle(openSections.blur)}>
          {renderCardHeader('blur', 'eyeOff', 'تمويه الخصوصية (Blur)')}
          {openSections.blur && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <button
                type="button"
                onClick={handleAddBlur}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 7,
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: '0 1px 4px rgba(37, 99, 235, 0.25)',
                }}
              >
                <Icon name="plus" size={13} />
                <span>إضافة تمويه جديد (Blur)</span>
              </button>

              {blurBoxes.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 7,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: `0.5px dashed ${theme.border}`,
                    textAlign: 'center',
                    fontSize: 11,
                    color: theme.textDim,
                  }}
                >
                  لا توجد مربعات تمويه حالياً. اضغط "إضافة تمويه جديد" أو اسحب على الصورة.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10.5, color: theme.textDim }}>
                    مربعات التمويه النشطة ({blurBoxes.length}):
                  </div>

                  {blurBoxes.map((region, idx) => {
                    const isSelected =
                      selectedBlurId === region.id || (selectedBlurId === null && blurBoxes.length === 1);
                    const isCircle =
                      region.shape === 'circle' || (region.borderRadius !== undefined && region.borderRadius >= 100);
                    const isRounded =
                      region.shape === 'rounded' || (!isCircle && (region.borderRadius ?? 0) > 0);
                    return (
                      <div
                        key={region.id}
                        onClick={() => setSelectedBlurId(region.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: `0.5px solid ${isSelected ? '#3b82f6' : theme.border}`,
                          background: isSelected ? 'rgba(59, 130, 246, 0.12)' : theme.bg,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="eyeOff" size={12} color={isSelected ? '#3b82f6' : theme.textDim} />
                          <span style={{ fontSize: 11.5, fontWeight: isSelected ? 700 : 500, color: theme.text }}>
                            تمويه {idx + 1}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              color: theme.accent,
                              background: 'rgba(59, 130, 246, 0.15)',
                              padding: '1px 5px',
                              borderRadius: 3,
                            }}
                          >
                            {isCircle ? 'دائري' : isRounded ? 'مستدير' : 'مربع'}
                          </span>
                          <span style={{ fontSize: 10, color: theme.textDim }}>
                            ({Math.round(region.width)}% × {Math.round(region.height)}%)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBlur(region.id);
                          }}
                          title="حذف مربع التمويه"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: theme.danger || '#ef4444',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            borderRadius: 4,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    );
                  })}

                  {targetBlur && (() => {
                    const isCircle =
                      targetBlur.shape === 'circle' ||
                      (targetBlur.borderRadius !== undefined && targetBlur.borderRadius >= 100);
                    const isRounded =
                      targetBlur.shape === 'rounded' || (!isCircle && (targetBlur.borderRadius ?? 0) > 0);
                    const isSquare = !isCircle && !isRounded;
                    const currentStrength = targetBlur.strength ?? 70;

                    return (
                      <div
                        style={{
                          marginTop: 4,
                          padding: '10px 12px',
                          borderRadius: 7,
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: `0.5px solid ${theme.border}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: theme.text }}>
                            إعدادات التمويه المختار
                          </span>
                          <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600 }}>
                            {isCircle ? 'دائري' : isRounded ? 'مستدير' : 'مربع'} • {currentStrength}px
                          </span>
                        </div>

                        {/* Shape Selection */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <span style={{ fontSize: 10.5, color: theme.textDim, fontWeight: 600 }}>
                            الشكل:
                          </span>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                            {[
                              { label: 'مربع', active: isSquare, shape: 'square' as const, borderRadius: 0 },
                              {
                                label: 'مستدير',
                                active: isRounded,
                                shape: 'rounded' as const,
                                borderRadius:
                                  targetBlur.borderRadius && targetBlur.borderRadius < 100
                                    ? targetBlur.borderRadius
                                    : 24,
                              },
                              { label: 'دائري', active: isCircle, shape: 'circle' as const, borderRadius: 9999 },
                            ].map((opt) => (
                              <button
                                key={opt.label}
                                type="button"
                                onClick={() =>
                                  handleUpdateBlur({
                                    ...targetBlur,
                                    shape: opt.shape,
                                    borderRadius: opt.borderRadius,
                                  })
                                }
                                style={{
                                  height: 28,
                                  borderRadius: 5,
                                  border: `1px solid ${opt.active ? '#3b82f6' : theme.border}`,
                                  background: opt.active ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                  color: opt.active ? '#60a5fa' : theme.text,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {isRounded && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                              <span style={{ fontSize: 9.5, color: theme.textDim, minWidth: 55 }}>
                                نصف القطر:
                              </span>
                              <input
                                type="range"
                                min={6}
                                max={64}
                                step={2}
                                value={targetBlur.borderRadius ?? 24}
                                onChange={(e) =>
                                  handleUpdateBlur({
                                    ...targetBlur,
                                    shape: 'rounded',
                                    borderRadius: Number(e.target.value),
                                  })
                                }
                                style={{ flex: 1, accentColor: '#3b82f6', height: 4 }}
                              />
                              <span style={{ fontSize: 10, color: theme.text, minWidth: 30, textAlign: 'left' }}>
                                {targetBlur.borderRadius ?? 24}px
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Blur Strength */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10.5, color: theme.textDim, fontWeight: 600 }}>
                              قوة التمويه:
                            </span>
                            <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600 }}>
                              {currentStrength}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={20}
                            max={130}
                            step={5}
                            value={currentStrength}
                            onChange={(e) =>
                              handleUpdateBlur({
                                ...targetBlur,
                                strength: Number(e.target.value),
                              })
                            }
                            style={{ width: '100%', accentColor: '#3b82f6', height: 4 }}
                          />
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                            {BLUR_STRENGTH_PRESETS.map((preset) => {
                              const active = currentStrength === preset.val;
                              return (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateBlur({
                                      ...targetBlur,
                                      strength: preset.val,
                                    })
                                  }
                                  style={{
                                    height: 22,
                                    borderRadius: 4,
                                    border: `0.5px solid ${active ? '#3b82f6' : theme.border}`,
                                    background: active ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                    color: active ? '#60a5fa' : theme.textDim,
                                    fontSize: 9.5,
                                    fontWeight: active ? 700 : 500,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
