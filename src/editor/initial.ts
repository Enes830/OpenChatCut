import templatesJson from '../../assets/templates/openchatcut-templates.json';
import socialShortsJson from '../../assets/templates/social-shorts-templates.json';
import kouboScenesJson from '../../assets/templates/koubo-scenes-templates.json';
import rasdNewsCode from '../../remotion/RasdNews.mg.jsx?raw';
import rasdQuoteCode from '../../remotion/RasdQuote.mg.jsx?raw';
import type { Tpl } from '../types';
import type { TimelineState } from './types';

export const RASD_QUOTE_TEMPLATE: Tpl = {
  id: 'rasd-quote-single',
  name: 'خبر عاجل (Rasd Quote)',
  category: 'title-cards',
  description: 'Rasd Arabic Quote Box',
  width: 1080,
  height: 1440,
  fps: 30,
  durationInFrames: 150,
  props: {
    text: 'ترامب لفوكس نيوز: سنصبح حماة مضيق هرمز',
    fontFamily: 'GhroobArabic',
    textColor: '#FFFFFF',
  },
  propSchema: [
    { key: 'text', label: 'Quote Text', type: 'text', defaultValue: 'ترامب لفوكس نيوز: سنصبح حماة مضيق هرمز' },
    { key: 'fontFamily', label: 'Font Family', type: 'font', defaultValue: 'GhroobArabic' },
    { key: 'textColor', label: 'Text Color', type: 'color', defaultValue: '#FFFFFF' },
  ],
  thumb: null,
  code: rasdQuoteCode,
};

export const RASD_NEWS_TEMPLATE: Tpl = {
  id: 'rasd-news-arabic',
  name: 'عاجل (Rasd News Complete)',
  category: 'title-cards',
  description: 'Rasd Arabic Breaking News Template',
  width: 1080,
  height: 1440,
  fps: 30,
  durationInFrames: 700,
  props: {
    photoSrc: 'rasd/sample-photo.jpg',
    sourceText: 'عاجل',
    quote1: 'ترامب لفوكس نيوز: سنصبح حماة مضيق هرمز وربما نطلق على أنفسنا لقب الملاك الحارس للمضيق',
    quote2: 'ترامب لفوكس نيوز: كنا نحرس مضيق هرمز دون مقابل أما الآن فسنحرسه ونحصل على مقابل لذلك',
    quote3: 'ترامب لفوكس نيوز: ينبغي أن نتقاضى مقابلا على حراسة المضيق وعندما نقوم بحراسته سنحصل على تعويض',
    fontFamily: 'GhroobArabic',
    textColor: '#FFFFFF',
    backgroundImageSrc: 'rasd/template-bg.png',
  },
  propSchema: [
    { key: 'photoSrc', label: 'Photo / Media', type: 'image', defaultValue: 'rasd/sample-photo.jpg' },
    { key: 'sourceText', label: 'Source Label', type: 'string', defaultValue: 'عاجل' },
    { key: 'quote1', label: 'Headline Quote 1', type: 'text', defaultValue: 'ترامب لفوكس نيوز: سنصبح حماة مضيق هرمز وربما نطلق على أنفسنا لقب الملاك الحارس للمضيق' },
    { key: 'quote2', label: 'Headline Quote 2', type: 'text', defaultValue: 'ترامب لفوكس نيوز: كنا نحرس مضيق هرمز دون مقابل أما الآن فسنحرسه ونحصل على مقابل لذلك' },
    { key: 'quote3', label: 'Headline Quote 3', type: 'text', defaultValue: 'ترامب لفوكس نيوز: ينبغي أن نتقاضى مقابلا على حراسة المضيق وعندما نقوم بحراسته سنحصل على تعويض' },
    { key: 'fontFamily', label: 'Font Family', type: 'font', defaultValue: 'GhroobArabic' },
    { key: 'textColor', label: 'Text Color', type: 'color', defaultValue: '#FFFFFF' },
    { key: 'backgroundImageSrc', label: 'Template Background', type: 'image', defaultValue: 'rasd/template-bg.png' },
  ],
  thumb: null,
  code: rasdNewsCode,
};

export const TEMPLATES = [
  RASD_QUOTE_TEMPLATE,
  RASD_NEWS_TEMPLATE,
  ...(templatesJson as Tpl[]),
  ...(socialShortsJson as Tpl[]),
  ...(kouboScenesJson as Tpl[]),
];

export const INITIAL: TimelineState = {
  fps: 30,
  width: 1080,
  height: 1440,
  trackOrder: ['V3', 'V2', 'V1'],
  tracks: {
    V1: { kind: 'video' },
    V2: { kind: 'video' },
    V3: { kind: 'video' },
  },
  items: [
    {
      id: 'bg_image',
      track: 'V1',
      startFrame: 0,
      durationInFrames: 700,
      name: 'Background Template',
      kind: 'image',
      src: 'rasd/template-bg.png',
      width: 1080,
      height: 1440,
    },
    {
      id: 'main_photo',
      track: 'V2',
      startFrame: 0,
      durationInFrames: 700,
      name: 'Upper Photo',
      kind: 'image',
      src: 'rasd/sample-photo.jpg',
      width: 1080,
      height: 860,
    },
    {
      id: 'quote_1',
      track: 'V3',
      startFrame: 0,
      durationInFrames: 120,
      name: 'Quote 1',
      kind: 'motion-graphic',
      templateId: RASD_QUOTE_TEMPLATE.id,
      code: rasdQuoteCode,
      width: 1080,
      height: 1440,
      props: {
        text: 'ترامب لفوكس نيوز: سنصبح حماة مضيق هرمز وربما نطلق على أنفسنا لقب الملاك الحارس للمضيق',
        fontFamily: 'GhroobArabic',
        textColor: '#FFFFFF',
      },
    },
    {
      id: 'quote_2',
      track: 'V3',
      startFrame: 135,
      durationInFrames: 186,
      name: 'Quote 2',
      kind: 'motion-graphic',
      templateId: RASD_QUOTE_TEMPLATE.id,
      code: rasdQuoteCode,
      width: 1080,
      height: 1440,
      props: {
        text: 'ترامب لفوكس نيوز: كنا نحرس مضيق هرمز دون مقابل أما الآن فسنحرسه ونحصل على مقابل لذلك',
        fontFamily: 'GhroobArabic',
        textColor: '#FFFFFF',
      },
    },
    {
      id: 'quote_3',
      track: 'V3',
      startFrame: 350,
      durationInFrames: 259,
      name: 'Quote 3',
      kind: 'motion-graphic',
      templateId: RASD_QUOTE_TEMPLATE.id,
      code: rasdQuoteCode,
      width: 1080,
      height: 1440,
      props: {
        text: 'ترامب لفوكس نيوز: ينبغي أن نتقاضى مقابلا على حراسة المضيق وعندما نقوم بحراسته سنحصل على تعويض',
        fontFamily: 'GhroobArabic',
        textColor: '#FFFFFF',
      },
    },
  ],
  selectedId: 'quote_1',
};


