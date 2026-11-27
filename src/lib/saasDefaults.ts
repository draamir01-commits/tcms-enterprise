import type { PlatformPublicConfig, SubscriptionPlan } from '../types/tcms';

export const DEFAULT_PLATFORM_CONFIG: PlatformPublicConfig = {
  platformNameEn: 'TCMS',
  platformNameAr: 'TCMS',
  subtitleEn: 'Training Center Management SaaS',
  subtitleAr: 'منصة سحابية لإدارة مراكز التدريب',
  logoDataUrl: '',
  faviconUrl: '/favicon.svg',
  primaryColor: '#0EA5E9',
  secondaryColor: '#06B6D4',
  accentVioletColor: '#7C3AED',
  heroHeadlineEn: 'Transform Your Training Center Into a Smarter Digital Business.',
  heroHeadlineAr: 'حوّل مركز التدريب الخاص بك إلى منظومة رقمية أكثر ذكاءً.',
  heroSubheadlineEn:
    'The all-in-one multi-tenant SaaS platform to manage candidates, corporate clients, courses, trainers, attendance, examinations, training cards, certificates, and instant verification.',
  heroSubheadlineAr:
    'منصة سحابية متكاملة متعددة المستأجرين لإدارة المتدربين والشركات والدورات والمدربين والحضور والاختبارات وبطاقات التدريب والشهادات والتحقق الفوري.',
  recommendedPlanCode: 'professional',
  contactEmail: '',
  contactPhone: '',
  addressEn: '',
  addressAr: '',
  copyrightEn: 'All rights reserved.',
  copyrightAr: 'جميع الحقوق محفوظة.',
  socialLinks: {
    linkedin: '',
    x: '',
    youtube: '',
    website: '',
  },
  privacyContentEn:
    'We process tenant, candidate, and operational records strictly inside isolated tenant boundaries to deliver authorized training center workflows, credential issuance, and verification.',
  privacyContentAr:
    'نعالج بيانات المستأجرين والمتدربين والعمليات التدريبية ضمن حدود معزولة لكل مركز تدريب لتنفيذ عمليات التدريب وإصدار الشهادات والتحقق منها.',
  termsContentEn:
    'Each subscribed training center operates an independent workspace responsible for the accuracy of uploaded candidate records, examination results, and issued credentials.',
  termsContentAr:
    'يدير كل مركز تدريب مشترك مساحة عمل مستقلة ويتحمل مسؤولية دقة بيانات المتدربين ونتائج الاختبارات والشهادات المصدرة.',
  cookiesContentEn:
    'Essential browser storage is used for authenticated Firebase session continuity and language direction preferences (English / Arabic).',
  cookiesContentAr:
    'يُستخدم التخزين الأساسي في المتصفح للحفاظ على جلسة الدخول وتفضيل لغة العرض (العربية / الإنجليزية).',
  dataProtectionContentEn:
    'Sensitive identity fields such as Iqama and Passport numbers are encrypted and masked at rest, protected behind role-based permissions and audit logs.',
  dataProtectionContentAr:
    'يتم تشفير وإخفاء الحقول الحساسة مثل أرقام الإقامة والجواز مع تطبيق صلاحيات الوصول حسب الدور وسجلات التدقيق.',
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    code: 'starter',
    nameEn: 'Starter',
    nameAr: 'الباقة الأساسية',
    taglineEn: 'For emerging centers launching structured operations',
    taglineAr: 'لمراكز التدريب الناشئة التي تبدأ التحول الرقمي',
    priceMonthly: 375,
    priceAnnual: 299,
    currency: 'SAR',
    recommended: false,
    isActive: true,
    displayOrder: 1,
    limits: {
      maxCandidates: 500,
      maxUsers: 8,
      maxBatches: 40,
      maxCertificates: 500,
      maxCorporateClients: 15,
    },
    featuresEn: [
      'Up to 500 active candidates',
      '8 staff & trainer accounts',
      'Course & batch scheduling',
      'Attendance & examination tracking',
      'QR training cards & certificates',
      'Bilingual EN / AR workspace',
    ],
    featuresAr: [
      'حتى 500 متدرب نشط',
      '8 حسابات للموظفين والمدربين',
      'إدارة الدورات والدفعات التدريبية',
      'تتبع الحضور والاختبارات',
      'بطاقات التدريب والشهادات برمز QR',
      'واجهة ثنائية اللغة (عربي / إنجليزي)',
    ],
  },
  {
    id: 'professional',
    code: 'professional',
    nameEn: 'Professional',
    nameAr: 'الباقة الاحترافية',
    taglineEn: 'Full training automation for growing centers',
    taglineAr: 'أتمتة كاملة لعمليات مراكز التدريب المتنامية',
    priceMonthly: 949,
    priceAnnual: 749,
    currency: 'SAR',
    recommended: true,
    isActive: true,
    displayOrder: 2,
    limits: {
      maxCandidates: 3000,
      maxUsers: 30,
      maxBatches: 250,
      maxCertificates: 3000,
      maxCorporateClients: 80,
    },
    featuresEn: [
      'Up to 3,000 candidates & certificates',
      'Corporate Client Portal included',
      'Custom Certificate & Card Designer',
      'Excel bulk import & error validation',
      'Email & WhatsApp Cloud notifications',
      'Public QR verification portal',
    ],
    featuresAr: [
      'حتى 3,000 متدرب وشهادة',
      'بوابة عملاء الشركات متضمنة',
      'مصمم مخصص للشهادات وبطاقات التدريب',
      'استيراد وتصدير Excel مع فحص الأخطاء',
      'إشعارات البريد الإلكتروني وواتساب السحابية',
      'بوابة التحقق العام برمز QR',
    ],
  },
  {
    id: 'business',
    code: 'business',
    nameEn: 'Business',
    nameAr: 'باقة الأعمال',
    taglineEn: 'Multi-client scale with deep analytics & audit trails',
    taglineAr: 'توسع مؤسسي مع تحليلات متقدمة وسجلات تدقيق شاملة',
    priceMonthly: 1899,
    priceAnnual: 1499,
    currency: 'SAR',
    recommended: false,
    isActive: true,
    displayOrder: 3,
    limits: {
      maxCandidates: 15000,
      maxUsers: 100,
      maxBatches: 1000,
      maxCertificates: 15000,
      maxCorporateClients: 300,
    },
    featuresEn: [
      'Up to 15,000 candidates & certificates',
      '100 internal, trainer & client users',
      'Course-specific templates & backgrounds',
      'Granular role & permission matrix',
      'Full analytics & KPI reports export',
      'Priority onboarding & support SLA',
    ],
    featuresAr: [
      'حتى 15,000 متدرب وشهادة',
      '100 مستخدم للإدارة والمدربين والشركات',
      'قوالب وخلفيات مخصصة لكل دورة',
      'مصفوفة صلاحيات دقيقة حسب الدور',
      'تقارير وتحليلات شاملة قابلة للتصدير',
      'أولوية في الإعداد والدعم الفني',
    ],
  },
  {
    id: 'enterprise',
    code: 'enterprise',
    nameEn: 'Enterprise',
    nameAr: 'الباقة المؤسسية',
    taglineEn: 'Custom capacity for national academies & groups',
    taglineAr: 'سعة مخصصة للأكاديميات الكبرى والمجموعات التدريبية',
    priceMonthly: 3749,
    priceAnnual: 2999,
    currency: 'SAR',
    recommended: false,
    isActive: true,
    displayOrder: 4,
    limits: {
      maxCandidates: 100000,
      maxUsers: 500,
      maxBatches: 5000,
      maxCertificates: 100000,
      maxCorporateClients: 2000,
    },
    featuresEn: [
      'High-volume multi-center scale',
      'Dedicated tenant branding & templates',
      'WhatsApp & SMTP custom credentials',
      'Complete audit & verification logs',
      'Dedicated customer success architect',
      'Custom SLA & migration assistance',
    ],
    featuresAr: [
      'سعة عالية للمجموعات والأكاديميات الكبرى',
      'هوية بصرية وقوالب مستقلة بالكامل',
      'ربط مخصص لبوابات البريد وواتساب',
      'سجلات تدقيق وتحقق متكاملة',
      'مدير نجاح عملاء مخصص',
      'اتفاقية مستوى خدمة مخصصة ونقل البيانات',
    ],
  },
];

export function formatPlanPrice(amount: number, currency: string, lang: 'en' | 'ar'): string {
  const code = (currency || 'SAR').trim().toUpperCase();
  const formattedNumber = Number(amount || 0).toLocaleString('en-US');
  if (code === 'SAR') {
    return lang === 'ar' ? `${formattedNumber} ر.س` : `SAR ${formattedNumber}`;
  }
  return `${code} ${formattedNumber}`;
}

