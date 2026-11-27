import type { LanguageCode } from '../types/tcms';

export interface FeatureCardCopy {
  id: string;
  title: string;
  description: string;
}

export interface PillarCopy {
  title: string;
  description: string;
}

export interface ShowcaseCopy {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
}

export interface StepCopy {
  number: string;
  title: string;
  description: string;
}

export interface FaqCopy {
  q: string;
  a: string;
}

export interface LandingCopy {
  nav: {
    home: string;
    features: string;
    solutions: string;
    howItWorks: string;
    pricing: string;
    faq: string;
    login: string;
    getStarted: string;
    superAdmin: string;
    switchLang: string;
  };
  hero: {
    eyebrow: string;
    ctaPrimary: string;
    ctaSecondary: string;
    ctaLogin: string;
    previewLabel: string;
    highlights: string[];
  };
  trust: {
    eyebrow: string;
    title: string;
    subtitle: string;
    pillars: PillarCopy[];
  };
  featuresSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: FeatureCardCopy[];
  };
  showcaseSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: ShowcaseCopy[];
    openVerifyCta: string;
  };
  multiTenant: {
    eyebrow: string;
    title: string;
    subtitle: string;
    superAdminLabel: string;
    superAdminDesc: string;
    isolatedBadge: string;
    tenantA: string;
    tenantB: string;
    tenantC: string;
    rolesLabel: string[];
  };
  bilingual: {
    eyebrow: string;
    title: string;
    subtitle: string;
    bullets: string[];
    toggleDemoEn: string;
    toggleDemoAr: string;
  };
  security: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: PillarCopy[];
  };
  howItWorks: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: StepCopy[];
    cta: string;
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    monthly: string;
    annual: string;
    annualNote: string;
    perMonth: string;
    billedAnnually: string;
    recommended: string;
    choosePlan: string;
    limitsLabels: {
      candidates: string;
      users: string;
      batches: string;
      certificates: string;
    };
  };
  faq: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: FaqCopy[];
  };
  finalCta: {
    title: string;
    subtitle: string;
    primary: string;
    secondary: string;
  };
  footer: {
    productTitle: string;
    accountTitle: string;
    legalTitle: string;
    supportTitle: string;
    links: {
      register: string;
      login: string;
      verify: string;
      superAdmin: string;
      privacy: string;
      terms: string;
      cookies: string;
      dataProtection: string;
      contactUs: string;
      helpCenter: string;
      support: string;
    };
  };
  contactModal: {
    title: string;
    subtitle: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    subject: string;
    message: string;
    submit: string;
    sending: string;
    successTitle: string;
    successBody: string;
    close: string;
  };
}

export const LANDING_COPY: Record<LanguageCode, LandingCopy> = {
  en: {
    nav: {
      home: 'Home',
      features: 'Features',
      solutions: 'Solutions',
      howItWorks: 'How It Works',
      pricing: 'Pricing',
      faq: 'FAQ',
      login: 'Login',
      getStarted: 'Get Started',
      superAdmin: 'Super Admin',
      switchLang: 'العربية',
    },
    hero: {
      eyebrow: 'MULTI-TENANT TRAINING OPERATIONS PLATFORM',
      ctaPrimary: 'GET STARTED',
      ctaSecondary: 'EXPLORE PLATFORM',
      ctaLogin: 'LOGIN TO YOUR ACCOUNT',
      previewLabel: 'Sample Workspace Preview',
      highlights: [
        'Strict Per-Tenant Data Isolation',
        'Bilingual English & Arabic (RTL)',
        'QR Certificates & Training Cards',
      ],
    },
    trust: {
      eyebrow: 'ENTERPRISE FOUNDATION',
      title: 'Everything Your Training Center Needs. One Intelligent Platform.',
      subtitle:
        'Unify trainee onboarding, trainer scheduling, attendance tracking, assessments, corporate client coordination, and credential verification in a single architecture.',
      pillars: [
        {
          title: 'Centralized Management',
          description:
            'Replace disconnected spreadsheets and paper folders with one structured system linking candidates, batches, trainers, and corporate sponsors.',
        },
        {
          title: 'Intelligent Automation',
          description:
            'Automatically enforce certificate eligibility rules, generate PDF training cards and certificates, and dispatch WhatsApp and Email notifications.',
        },
        {
          title: 'Secure Multi-Tenant Architecture',
          description:
            'Every training center operates inside an isolated workspace with its own branding, role permission matrix, audit logs, and encrypted identity records.',
        },
        {
          title: 'Business Scalability',
          description:
            'Scale from one training branch and a handful of monthly courses to high-volume national certification operations with corporate self-service.',
        },
      ],
    },
    featuresSection: {
      eyebrow: 'CORE CAPABILITIES',
      title: 'Twelve Integrated Modules Built for Real Training Operations',
      subtitle:
        'Every workflow connects seamlessly from initial candidate registration to verified credential issuance.',
      items: [
        {
          id: 'candidates',
          title: 'Candidate Management',
          description:
            'Complete bilingual profiles, masked Iqama & Passport numbers, encrypted identity storage, document vault, and corporate association.',
        },
        {
          id: 'courses',
          title: 'Course Management',
          description:
            'Configure theory/practical hours, minimum attendance & exam passing thresholds, certificate validity periods, and custom templates.',
        },
        {
          id: 'trainers',
          title: 'Trainer Management',
          description:
            'Manage instructor qualifications, assigned courses, credential uploads, and batch-scoped attendance and grading portals.',
        },
        {
          id: 'batches',
          title: 'Training Batch Management',
          description:
            'Schedule classroom, practical, online, or hybrid cohorts with capacity limits, instructor assignment, and live enrollment counters.',
        },
        {
          id: 'attendance',
          title: 'Attendance Management',
          description:
            'Record daily present, absent, late, or excused sessions, enforce trainer lock submissions, and compute exact eligibility percentages.',
        },
        {
          id: 'assessments',
          title: 'Examination Management',
          description:
            'Track written, practical, and oral exam attempts with passing score checks, audit-logged corrections, and completion approvals.',
        },
        {
          id: 'cards',
          title: 'Automatic Training Cards',
          description:
            'Generate printable ID training cards with candidate photos, validity badges, and dynamic QR codes backed by versioned card templates.',
        },
        {
          id: 'certificates',
          title: 'Certificate Management',
          description:
            'Issue, reissue, or revoke tamper-evident PDF certificates using custom designer layouts and 10 curated background themes.',
        },
        {
          id: 'verification',
          title: 'Certificate Verification',
          description:
            'Give employers and regulators an instant zero-PII QR and serial verification portal plus internal verification logs.',
        },
        {
          id: 'corporate',
          title: 'Corporate Client Portal',
          description:
            'Allow client organizations to manage their employee rosters, submit enrollment requests, and download company certificates.',
        },
        {
          id: 'reports',
          title: 'Reports and Analytics',
          description:
            'Live KPI dashboards, monthly registration trends, exam pass rates, attendance performance, and filterable CSV/Excel/PDF exports.',
        },
        {
          id: 'notifications',
          title: 'Notifications (WhatsApp & Email)',
          description:
            'Send bilingual alerts and credential delivery links through WhatsApp Business Cloud API and SMTP email with delivery tracking.',
        },
      ],
    },
    showcaseSection: {
      eyebrow: 'PRODUCT TOUR',
      title: 'Designed for Speed, Clarity, and Operational Control',
      subtitle:
        'Explore how administrators, trainers, corporate clients, and certificate officers collaborate inside one clean workspace.',
      openVerifyCta: 'Open Public Verification Portal',
      items: [
        {
          id: 'dashboard',
          eyebrow: '01 · COMMAND CENTER',
          title: 'Training Center Dashboard',
          description:
            'Monitor total candidates, active batches, upcoming sessions, pending enrollment approvals, assessment queues, and certificate issuance in real time.',
          bullets: [
            'Live KPI metrics computed directly from verified operational records',
            'Filterable monthly registration, pass-rate, and attendance charts',
            'Pending approval and failed delivery alerts at a glance',
          ],
        },
        {
          id: 'candidates',
          eyebrow: '02 · IDENTITY VAULT',
          title: 'Candidate Management',
          description:
            'Onboard individuals or upload hundreds of rows via Excel validation while safeguarding sensitive government IDs and passport scans.',
          bullets: [
            'Bilingual English & Arabic candidate names and job metadata',
            'HMAC duplicate ID detection across Iqama and Passport numbers',
            'Private document vault for photos, ID copies, and attachments',
          ],
        },
        {
          id: 'credentials',
          eyebrow: '03 · DESIGN STUDIO',
          title: 'Training Cards & Certificates',
          description:
            'Design course-specific or center-wide templates with custom backgrounds, stamps, signatures, and automated PDF generation.',
          bullets: [
            '10 curated SVG/CSS backgrounds plus custom template positioning',
            'Automatic eligibility checks before certificate issuance',
            'Full revision history for reissued or superseded documents',
          ],
        },
        {
          id: 'verification',
          eyebrow: '04 · PUBLIC TRUST',
          title: 'Certificate Verification',
          description:
            'Every certificate and training card embeds a cryptographic verification token and QR link so third parties verify authenticity in seconds.',
          bullets: [
            'Zero-PII public lookup exposing only verified credential status',
            'Real-time valid, expired, revoked, or superseded indicators',
            'Automatic public & internal verification audit logging',
          ],
        },
        {
          id: 'corporate',
          eyebrow: '05 · B2B PORTAL',
          title: 'Corporate Client Portal',
          description:
            'Empower corporate HR and HSE teams to register employees, request course enrollments, track batch attendance, and download company certificates.',
          bullets: [
            'Strict organization-level data boundary for every client company',
            'Self-service enrollment request and info-request workflow',
            'Bulk employee upload with row-by-row Excel error reporting',
          ],
        },
      ],
    },
    multiTenant: {
      eyebrow: 'SAAS ARCHITECTURE',
      title: 'One Platform. Independent Training Businesses.',
      subtitle:
        'Each subscribed training company operates inside its own logical workspace with separate users, corporate clients, templates, branding, and audit history—governed centrally by the SaaS Platform Super Admin.',
      superAdminLabel: 'Platform Super Admin Console',
      superAdminDesc: 'Manages tenants, subscription plans, platform branding & leads',
      isolatedBadge: 'Isolated Workspace',
      tenantA: 'Safety First Academy',
      tenantB: 'Gulf Technical Institute',
      tenantC: 'Horizon HSE Center',
      rolesLabel: ['Tenant Owner', 'Admin', 'Certificate Officer', 'Trainer', 'Corporate Client', 'Candidate'],
    },
    bilingual: {
      eyebrow: 'GLOBAL & REGIONAL READY',
      title: 'Designed for Global Training Operations.',
      subtitle:
        'Seamless English (LTR) and Arabic (RTL) support built from the ground up across interfaces, Excel templates, WhatsApp alerts, training cards, and certificates.',
      bullets: [
        'Instant UI language and RTL direction switching per user',
        'Dual-language candidate, course, and organization fields',
        'Bilingual certificate layouts, email subjects, and WhatsApp templates',
      ],
      toggleDemoEn: 'English (LTR)',
      toggleDemoAr: 'العربية (RTL)',
    },
    security: {
      eyebrow: 'SECURITY & GOVERNANCE',
      title: 'Your Training Data. Your Control.',
      subtitle:
        'Engineered with strict multi-tenant boundaries, authenticated server enforcement, and verifiable credential integrity.',
      items: [
        {
          title: 'Strict Tenant Isolation',
          description:
            'Every API route and Firestore security rule validates active tenant ownership so no training center can access another organization’s records.',
        },
        {
          title: 'Role-Based Access Control',
          description:
            'Enforce granular permissions across Tenant Owners, Admins, Certificate Officers, Trainers, Corporate Clients, and Candidates.',
        },
        {
          title: 'Protected Documents & Encryption',
          description:
            'Sensitive identity numbers are encrypted and masked at rest, while uploaded ID scans and PDFs are served only through authorized endpoints.',
        },
        {
          title: 'Complete Audit Trails & QR Verification',
          description:
            'Track login events, password updates, score corrections, certificate revocations, and public verification lookups in immutable audit logs.',
        },
      ],
    },
    howItWorks: {
      eyebrow: 'ONBOARDING WORKFLOW',
      title: 'Launch Your Digital Training Center in Five Steps',
      subtitle: 'Go from registration to issuing your first QR-verified certificates in minutes.',
      steps: [
        {
          number: '01',
          title: 'Register Your Company',
          description: 'Create your training center workspace, select a subscription plan, and verify your owner account.',
        },
        {
          number: '02',
          title: 'Configure Workspace Branding',
          description: 'Upload your center logo, official stamp, signatory signature, colors, and message templates.',
        },
        {
          number: '03',
          title: 'Add Your Team & Clients',
          description: 'Invite trainers, certificate officers, administrators, and corporate client accounts.',
        },
        {
          number: '04',
          title: 'Manage Courses & Batches',
          description: 'Import candidates via Excel, enroll trainees into batches, track attendance, and record assessments.',
        },
        {
          number: '05',
          title: 'Issue Verified Credentials',
          description: 'Generate branded training cards and PDF certificates with instant QR verification and delivery.',
        },
      ],
      cta: 'GET STARTED',
    },
    pricing: {
      eyebrow: 'SUBSCRIPTION PLANS',
      title: 'Transparent Plans Built to Grow With Your Center',
      subtitle: 'Choose a monthly or annual billing cycle and launch your isolated tenant workspace immediately.',
      monthly: 'Monthly',
      annual: 'Annual',
      annualNote: 'Save 20% annually',
      perMonth: '/ month',
      billedAnnually: 'billed annually per month',
      recommended: 'Recommended',
      choosePlan: 'Select Plan',
      limitsLabels: {
        candidates: 'Candidates',
        users: 'Team Users',
        batches: 'Batches',
        certificates: 'Certificates',
      },
    },
    faq: {
      eyebrow: 'FREQUENTLY ASKED QUESTIONS',
      title: 'Answers to Common Questions',
      subtitle: 'Everything training center owners and administrators need to know before launching.',
      items: [
        {
          q: 'How does multi-tenant isolation work?',
          a: 'Each training center receives its own logically isolated tenant workspace identified by a unique Tenant ID. Both backend API routes and Firestore security rules verify tenant membership on every read and write.',
        },
        {
          q: 'Can each training center use its own logo, stamp, signature, and branding?',
          a: 'Yes. Inside Company Settings and Template Designers, every tenant uploads its own center logo, official stamp, authorized signatory signature, brand colors, certificate footers, and background themes.',
        },
        {
          q: 'Can our corporate clients log in directly?',
          a: 'Yes. You can create Corporate Client accounts bound to specific client organizations so they can manage employee profiles, submit batch enrollment requests, track attendance, and download their own certificates.',
        },
        {
          q: 'Does the platform support both English and Arabic (RTL)?',
          a: 'Yes. The entire application—including the public site, operational dashboard, data forms, Excel templates, notifications, training cards, and certificates—supports full English (LTR) and Arabic (RTL).',
        },
        {
          q: 'How do external employers verify issued certificates?',
          a: 'Every issued certificate contains a unique serial number, verification token, and QR code. Scanning the QR code opens the Public Verification Portal displaying verified status without exposing sensitive private ID numbers.',
        },
        {
          q: 'Can we import existing candidates and employees from Excel?',
          a: 'Yes. Our Excel Import/Export module provides downloadable templates and performs row-by-row validation, required-field checks, format validation, duplicate detection, and downloadable error reports before committing.',
        },
        {
          q: 'Can trainers mark attendance and record examination scores?',
          a: 'Yes. Trainers get a scoped workspace showing only their assigned batches, allowing daily attendance submission and exam mark recording subject to administrative review and correction rules.',
        },
        {
          q: 'Does TCMS support WhatsApp and Email notifications?',
          a: 'Yes. Each tenant can configure SMTP email credentials and WhatsApp Business Cloud API settings, customize bilingual templates with dynamic placeholders, and monitor delivery logs.',
        },
        {
          q: 'Is it safe to store Iqama numbers, passports, and identity scans?',
          a: 'Yes. Government ID numbers are encrypted using authenticated encryption before storage, displayed masked in standard tables, and uploaded documents are stored in a private vault gated by role permissions.',
        },
        {
          q: 'Can certificate issuance enforce attendance and exam pass rules automatically?',
          a: 'Yes. Courses define minimum attendance percentages and passing exam scores, and the eligibility engine checks those thresholds before certificates can be generated.',
        },
        {
          q: 'Can we upgrade plans or adjust limits as our training center expands?',
          a: 'Yes. Subscription plans and tenant quotas are centrally managed by the Platform Super Admin and can be updated seamlessly without migrating or re-entering any training data.',
        },
        {
          q: 'How quickly can our training center start using the system?',
          a: 'In minutes. Complete the online company registration, verify your owner email address, and sign straight into your pre-configured tenant workspace.',
        },
      ],
    },
    finalCta: {
      title: 'Your Training Center Deserves a Smarter System.',
      subtitle:
        'Bring structured candidate workflows, corporate client collaboration, and tamper-evident QR credentials to your organization today.',
      primary: 'CREATE YOUR TRAINING CENTER',
      secondary: 'LOGIN TO YOUR ACCOUNT',
    },
    footer: {
      productTitle: 'Product',
      accountTitle: 'Platform Access',
      legalTitle: 'Legal & Governance',
      supportTitle: 'Support & Contact',
      links: {
        register: 'Register Training Center',
        login: 'Tenant & Staff Login',
        verify: 'Certificate Verification',
        superAdmin: 'Super Admin Portal',
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        cookies: 'Cookie Policy',
        dataProtection: 'Data Protection',
        contactUs: 'Contact Us',
        helpCenter: 'Help Center (FAQ)',
        support: 'Request Support',
      },
    },
    contactModal: {
      title: 'Contact Platform Team',
      subtitle: 'Have questions about enterprise onboarding, custom plans, or technical setup? Send us a message.',
      name: 'Full Name',
      email: 'Work Email',
      phone: 'Phone Number (Optional)',
      company: 'Training Center / Organization',
      subject: 'Subject',
      message: 'Message',
      submit: 'Send Inquiry',
      sending: 'Sending...',
      successTitle: 'Inquiry Received',
      successBody: 'Thank you for reaching out. Our platform team will review your inquiry shortly.',
      close: 'Close',
    },
  },
  ar: {
    nav: {
      home: 'الرئيسية',
      features: 'المميزات',
      solutions: 'الحلول',
      howItWorks: 'كيف يعمل',
      pricing: 'الباقات',
      faq: 'الأسئلة الشائعة',
      login: 'تسجيل الدخول',
      getStarted: 'ابدأ الآن',
      superAdmin: 'الإدارة العليا',
      switchLang: 'English',
    },
    hero: {
      eyebrow: 'منصة سحابية متعددة المستأجرين لإدارة مراكز التدريب',
      ctaPrimary: 'ابدأ الآن',
      ctaSecondary: 'استكشف المنصة',
      ctaLogin: 'تسجيل الدخول لحسابك',
      previewLabel: 'معاينة نموذجية لمساحة العمل',
      highlights: [
        'عزل كامل لبيانات كل مركز تدريب',
        'دعم كامل للغتين العربية والإنجليزية',
        'شهادات وبطاقات تدريب مع تحقق QR',
      ],
    },
    trust: {
      eyebrow: 'أساس مؤسسي متكامل',
      title: 'كل ما يحتاجه مركز التدريب الخاص بك. في منصة ذكية واحدة.',
      subtitle:
        'اجمع تسجيل المتدربين وجدولة المدربين والحضور والاختبارات وبوابة الشركات وإصدار الشهادات والتحقق الفوري في نظام واحد مترابط.',
      pillars: [
        {
          title: 'إدارة مركزية موحدة',
          description:
            'استبدل الملفات المتفرقة وجداول البيانات اليدوية بنظام موحد يربط المتدربين والدورات والمدربين والشركات العميلة.',
        },
        {
          title: 'أتمتة ذكية للعمليات',
          description:
            'تطبيق تلقائي لشروط استحقاق الشهادات، وتوليد ملفات PDF للبطاقات والشهادات، وإرسال تنبيهات واتساب والبريد الإلكتروني.',
        },
        {
          title: 'بنية متعددة المستأجرين آمنة',
          description:
            'يعمل كل مركز تدريب داخل مساحة عمل معزولة تماماً بهويته الخاصة ومصفوفة الصلاحيات وسجلات التدقيق والبيانات المشفرة.',
        },
        {
          title: 'قابلية عالية للتوسع',
          description:
            'توسع بسلاسة من مركز تدريب ناشئ إلى عمليات اعتماد واسعة النطاق مع بوابة خدمة ذاتية لعملاء الشركات.',
        },
      ],
    },
    featuresSection: {
      eyebrow: 'الوحدات الأساسية',
      title: 'اثنتا عشرة وحدة متكاملة مصممة لعمليات التدريب الفعلية',
      subtitle: 'ترابط كامل بين جميع المراحل بدءاً من تسجيل المتدرب وحتى التحقق العام من الشهادة.',
      items: [
        {
          id: 'candidates',
          title: 'إدارة المتدربين',
          description: 'ملفات ثنائية اللغة، إخفاء وتشفير أرقام الإقامة والجواز، خزنة مستندات خاصة، وربط مباشر بالشركات.',
        },
        {
          id: 'courses',
          title: 'إدارة الدورات التدريبية',
          description: 'إعداد الساعات النظرية والعملية، نسب الحضور ودرجات النجاح المطلوبة، مدة الصلاحية، والقوالب الافتراضية.',
        },
        {
          id: 'trainers',
          title: 'إدارة المدربين',
          description: 'تنظيم مؤهلات المدربين والدورات المسندة ومرفقات الاعتماد مع بوابة مخصصة للحضور والتقييم.',
        },
        {
          id: 'batches',
          title: 'إدارة الدفعات التدريبية',
          description: 'جدولة الدفعات الحضورية والعملية وعن بُعد والمدمجة مع سعة استيعابية ومتابعة المسجلين.',
        },
        {
          id: 'attendance',
          title: 'إدارة الحضور والغياب',
          description: 'تسجيل الحضور والغياب والتأخير والأعذار يومياً مع إقفال السجل وحساب نسبة الحضور تلقائياً.',
        },
        {
          id: 'assessments',
          title: 'إدارة الاختبارات والتقييم',
          description: 'رصد درجات الاختبارات النظرية والعملية والشفهية مع محاولات الإعادة ومراجعة التصحيحات واعتماد النتائج.',
        },
        {
          id: 'cards',
          title: 'إصدار بطاقات التدريب تلقائياً',
          description: 'إنشاء بطاقات تدريب احترافية للطباعة مزودة بصورة المتدرب ورمز QR عبر قوالب قابلة للتخصيص.',
        },
        {
          id: 'certificates',
          title: 'إدارة الشهادات',
          description: 'إصدار وإعادة إصدار أو إلغاء شهادات PDF احترافية باستخدام مصمم القوالب و10 خلفيات تصميم جاهزة.',
        },
        {
          id: 'verification',
          title: 'التحقق من الشهادات',
          description: 'بوابة تحقق عام فورية عبر رمز QR والرقم التسلسلي دون كشف البيانات الشخصية الحساسة.',
        },
        {
          id: 'corporate',
          title: 'بوابة عملاء الشركات',
          description: 'تمكين الشركات من إدارة موظفيها ورفع طلبات التسجيل في الدورات وتحميل الشهادات الخاصة بموظفيها.',
        },
        {
          id: 'reports',
          title: 'التقارير والتحليلات',
          description: 'مؤشرات أداء حية ورسوم بيانية للتسجيل ونسب النجاح والحضور مع تصدير Excel وCSV وPDF.',
        },
        {
          id: 'notifications',
          title: 'الإشعارات (واتساب والبريد)',
          description: 'إرسال تنبيهات ثنائية اللغة وروابط الشهادات عبر WhatsApp Cloud API والبريد الإلكتروني مع سجل تسليم.',
        },
      ],
    },
    showcaseSection: {
      eyebrow: 'جولة في المنصة',
      title: 'مصممة للسرعة والوضوح والسيطرة التشغيلية الكاملة',
      subtitle: 'شاهد كيف يعمل الإداريون والمدربون ومسؤولو الشهادات والشركات ضمن بيئة عمل واحدة متناغمة.',
      openVerifyCta: 'فتح بوابة التحقق العام',
      items: [
        {
          id: 'dashboard',
          eyebrow: '01 · مركز القيادة',
          title: 'لوحة تحكم مركز التدريب',
          description:
            'راقب إجمالي المتدربين والدفعات النشطة وجلسات اليوم وطلبات التسجيل المعلقة وقوائم الاعتماد والشهادات في الوقت الفعلي.',
          bullets: [
            'مؤشرات أداء مستمدة مباشرة من السجلات التشغيلية المعتمدة',
            'رسوم بيانية تفاعلية لنسب النجاح والحضور والتسجيل الشهري',
            'تنبيهات فورية للاعتمادات المعلقة وحالات الإشعارات الفاشلة',
          ],
        },
        {
          id: 'candidates',
          eyebrow: '02 · خزنة الهوية',
          title: 'إدارة المتدربين',
          description:
            'سجل المتدربين فردياً أو استورد مئات السجلات عبر قوالب Excel الذكية مع حماية مشفرة لأرقام الإقامة والجواز.',
          bullets: [
            'أسماء وبيانات المتدربين باللغتين العربية والإنجليزية',
            'كشف التكرار تلقائياً لأرقام الإقامة والجواز قبل الحفظ',
            'حفظ المستندات والصور الشخصية داخل خزنة ملفات محمية',
          ],
        },
        {
          id: 'credentials',
          eyebrow: '03 · استوديو التصميم',
          title: 'بطاقات التدريب والشهادات',
          description:
            'صمم قوالب عامة أو مخصصة لكل دورة مع خلفيات احترافية وختم وتوقيع المركز وتوليد فوري لملفات PDF.',
          bullets: [
            '10 خلفيات احترافية مدمجة مع تحكم كامل بمواضع العناصر',
            'فحص تلقائي لنسبة الحضور واجتياز الاختبار قبل الإصدار',
            'سجل إصدارات متكامل للشهادات المعاد إصدارها أو الملغاة',
          ],
        },
        {
          id: 'verification',
          eyebrow: '04 · الثقة والموثوقية',
          title: 'التحقق الفوري من الشهادات',
          description:
            'تحمل كل شهادة وبطاقة تدريب رمز تحقق ورابط QR يمكّن جهات العمل والمفتشين من التحقق من صحتها خلال ثوانٍ.',
          bullets: [
            'بحث عام آمن يعرض حالة الشهادة دون كشف بيانات الهوية الحساسة',
            'توضيح فوري لحالة الشهادة (سارية، منتهية، ملغاة، مستبدلة)',
            'تسجيل آلي لجميع عمليات التحقق العامة والداخلية',
          ],
        },
        {
          id: 'corporate',
          eyebrow: '05 · بوابة الأعمال',
          title: 'بوابة عملاء الشركات',
          description:
            'امنح إدارات الموارد البشرية والسلامة لدى عملائك حسابات مستقلة لإدارة موظفيهم وطلب الدورات وتحميل شهاداتهم.',
          bullets: [
            'عزل صارم لبيانات كل شركة عميلة عن بقية الشركات',
            'مسار منظم لطلبات التسجيل واستكمال البيانات الناقصة',
            'استيراد جماعي للموظفين مع تقارير أخطاء دقيقة لكل صف',
          ],
        },
      ],
    },
    multiTenant: {
      eyebrow: 'معمارية SAAS',
      title: 'منصة واحدة. مراكز تدريب مستقلة.',
      subtitle:
        'يعمل كل مركز تدريب مشترك في بيئته الخاصة بالكامل مع مستخدميه وشركاته وقوالبه وهويته وسجلاته، تحت إشراف مركزي من لوحة الإدارة العليا للمنصة.',
      superAdminLabel: 'بوابة الإدارة العليا للمنصة',
      superAdminDesc: 'تُدير المراكز المشتركة وباقات الاشتراك والهوية العامة والرسائل',
      isolatedBadge: 'بيئة معزولة',
      tenantA: 'أكاديمية السلامة الأولى',
      tenantB: 'المعهد التقني الخليجي',
      tenantC: 'مركز الأفق للتدريب',
      rolesLabel: ['مالك المركز', 'مدير النظام', 'مسؤول الشهادات', 'مدرب', 'عميل شركة', 'متدرب'],
    },
    bilingual: {
      eyebrow: 'جاهز للعمل إقليمياً وعالمياً',
      title: 'مصمم لعمليات التدريب العالمية وثنائية اللغة.',
      subtitle:
        'دعم أصيل ومتكامل للغتين العربية (RTL) والإنجليزية (LTR) في الواجهات والنماذج وقوالب Excel ورسائل واتساب والشهادات.',
      bullets: [
        'تبديل فوري للغة والاتجاه من اليمين لليسار لكل مستخدم',
        'حقول ثنائية اللغة للمتدربين والدورات والشركات',
        'قوالب شهادات وبريد ورسائل واتساب مزدوجة اللغة',
      ],
      toggleDemoEn: 'English (LTR)',
      toggleDemoAr: 'العربية (RTL)',
    },
    security: {
      eyebrow: 'الأمان والحوكمة',
      title: 'بيانات مركزك. تحت سيطرتك الكاملة.',
      subtitle: 'بنية محكمة لعزل المستأجرين وتطبيق صلاحيات الوصول وحفظ سلامة الشهادات والوثائق.',
      items: [
        {
          title: 'عزل صارم لكل مستأجر',
          description:
            'تتحقق نقاط الواجهة الخلفية وقواعد Firestore من انتماء كل طلب إلى مساحة العمل الصحيحة لمنع أي تداخل بين المراكز.',
        },
        {
          title: 'صلاحيات دقيقة حسب الدور',
          description:
            'تطبيق مصفوفة صلاحيات مخصصة لملاك المراكز والإداريين ومسؤولي الشهادات والمدربين وعملاء الشركات والمتدربين.',
        },
        {
          title: 'تشفير وحماية المستندات',
          description:
            'يتم تشفير أرقام الهوية وإخفاؤها في الجداول مع حفظ صور الهويات والشهادات في خزنة خاصة لا تُفتح إلا للمصرح لهم.',
        },
        {
          title: 'سجلات تدقيق والتحقق بالـ QR',
          description:
            'توثيق كامل لتسجيل الدخول وتغيير كلمات المرور وتعديل الدرجات وإلغاء الشهادات وعمليات التحقق العامة في سجلات دائمة.',
        },
      ],
    },
    howItWorks: {
      eyebrow: 'رحلة الانطلاق',
      title: 'ابدأ تشغيل مركز التدريب الرقمي في خمس خطوات',
      subtitle: 'انتقل من التسجيل إلى إصدار أول شهادة معتمدة برمز QR خلال دقائق.',
      steps: [
        {
          number: '01',
          title: 'سجّل مركز التدريب',
          description: 'أنشئ مساحة عمل مركزك، واختر باقة الاشتراك المناسبة، وفعّل بريد المالك.',
        },
        {
          number: '02',
          title: 'خصص هوية المركز',
          description: 'ارفع الشعار والختم الرسمي وتوقيع الاعتماد والألوان وقوالب الرسائل.',
        },
        {
          number: '03',
          title: 'أضف الفريق والعملاء',
          description: 'أنشئ حسابات الإداريين والمدربين ومسؤولي الشهادات وعملاء الشركات.',
        },
        {
          number: '04',
          title: 'أدر الدورات والدفعات',
          description: 'استورد المتدربين عبر Excel، وسجلهم في الدفعات، وتابع الحضور والاختبارات.',
        },
        {
          number: '05',
          title: 'أصدر بطاقات وشهادات معتمدة',
          description: 'ولّد بطاقات التدريب والشهادات بصيغة PDF مع تحقق QR وإرسال فوري.',
        },
      ],
      cta: 'ابدأ الآن',
    },
    pricing: {
      eyebrow: 'باقات الاشتراك',
      title: 'باقات واضحة تنمو مع توسع مركز التدريب',
      subtitle: 'اختر الفوترة الشهرية أو السنوية وأطلق مساحة عمل مركزك المعزولة فوراً.',
      monthly: 'شهري',
      annual: 'سنوي',
      annualNote: 'وفر 20% مع الاشتراك السنوي',
      perMonth: '/ شهرياً',
      billedAnnually: 'تُدفع سنوياً (بمعدل شهري)',
      recommended: 'الأكثر اختياراً',
      choosePlan: 'اختر الباقة',
      limitsLabels: {
        candidates: 'متدرب',
        users: 'مستخدم',
        batches: 'دفعة',
        certificates: 'شهادة',
      },
    },
    faq: {
      eyebrow: 'الأسئلة الشائعة',
      title: 'إجابات واضحة لأبرز استفسارات مراكز التدريب',
      subtitle: 'كل ما تحتاج معرفته قبل إطلاق مركز التدريب الخاص بك على المنصة.',
      items: [
        {
          q: 'كيف يعمل نظام العزل متعدد المستأجرين؟',
          a: 'يحصل كل مركز تدريب على مساحة عمل مستقلة مرتبطة بمعرف فريد (Tenant ID)، وتتحقق الواجهة الخلفية وقواعد الأمان في قاعدة البيانات من عدم وصول أي مركز لبيانات مركز آخر.',
        },
        {
          q: 'هل يمكن لكل مركز استخدام شعاره وختمه وتوقيعه وألوانه الخاصة؟',
          a: 'نعم، يوفر قسم إعدادات الشركة ومصمم القوالب إمكانية رفع الشعار والختم الرسمي والتوقيع المعتمد وتحديد الألوان والتذييل لكل مركز بشكل مستقل.',
        },
        {
          q: 'هل يستطيع عملاء الشركات تسجيل الدخول وإدارة موظفيهم؟',
          a: 'نعم، يمكنك إنشاء حسابات لعملاء الشركات مرتبطة بشركاتهم فقط لمتابعة بيانات موظفيهم، ورفع طلبات التسجيل في الدورات، ومراقبة الحضور، وتحميل الشهادات.',
        },
        {
          q: 'هل تدعم المنصة اللغتين العربية والإنجليزية بالكامل؟',
          a: 'نعم، جميع الشاشات ولوحة التحكم ونماذج الإدخال وقوالب Excel ورسائل الإشعارات وبطاقات التدريب والشهادات تدعم اللغتين العربية (RTL) والإنجليزية (LTR).',
        },
        {
          q: 'كيف تتحقق الجهات الخارجية من صحة الشهادات؟',
          a: 'تحمل كل شهادة رقماً تسلسلياً ورمز تحقق ورابط QR يفتح بوابة التحقق العام لعرض حالة الشهادة وتفاصيل الدورة دون إظهار أرقام الهويات الشخصية.',
        },
        {
          q: 'هل يمكن استيراد بيانات المتدربين والموظفين من ملفات Excel؟',
          a: 'نعم، تتوفر قوالب Excel جاهزة للاستيراد مع معاينة فورية وفحص للحقول المطلوبة وتنسيقات التواريخ وكشف التكرار وتقارير أخطاء قابلة للتحميل.',
        },
        {
          q: 'هل يمتلك المدربون صلاحية لتسجيل الحضور والدرجات؟',
          a: 'نعم، يحصل المدرب على صلاحيات محدودة بالدفعات المسندة إليه فقط لتسجيل الحضور اليومي ورصد درجات الاختبارات وفق ضوابط المراجعة والاعتماد.',
        },
        {
          q: 'هل يدعم النظام إرسال الإشعارات عبر واتساب والبريد الإلكتروني؟',
          a: 'نعم، يمكن لكل مركز ربط إعدادات SMTP وWhatsApp Business Cloud API وإدارة قوالب الرسائل العربية والإنجليزية ومتابعة سجل التسليم.',
        },
        {
          q: 'ما مستوى حماية أرقام الإقامة وجوازات السفر والمرفقات؟',
          a: 'يتم تشفير أرقام الهوية وإخفاؤها في الجداول مع تخزين المرفقات في خزنة ملفات محمية لا يمكن الوصول إليها إلا عبر مسارات مصرح بها حسب الدور.',
        },
        {
          q: 'هل يتحقق النظام تلقائياً من استيفاء شروط الشهادة قبل إصدارها؟',
          a: 'نعم، يفحص محرك الاستحقاق نسبة الحضور الفعلية واجتياز الاختبار المحددين في إعدادات الدورة قبل السماح بإصدار الشهادة.',
        },
        {
          q: 'هل يمكن ترقية الباقة أو تعديل حدود المركز مستقبلاً؟',
          a: 'نعم، يتم إدارة الباقات والحدود مركزياً ويمكن ترقية باقة أي مركز تدريب في أي وقت دون التأثير على البيانات القائمة.',
        },
        {
          q: 'كم يستغرق تفعيل مساحة عمل مركز التدريب والبدء بالعمل؟',
          a: 'خلال دقائق معدودة؛ أكمل نموذج تسجيل الشركة، وأكّد بريدك الإلكتروني عبر الرابط المرسل، ثم ادخل مباشرة إلى لوحة مركزك.',
        },
      ],
    },
    finalCta: {
      title: 'مركز التدريب الخاص بك يستحق نظاماً أكثر ذكاءً.',
      subtitle: 'انطلق اليوم بإدارة متكاملة للمتدربين والشركات وإصدار شهادات رقمية موثوقة.',
      primary: 'أنشئ حساب مركز التدريب',
      secondary: 'تسجيل الدخول لحسابك',
    },
    footer: {
      productTitle: 'المنتج',
      accountTitle: 'الوصول للمنصة',
      legalTitle: 'القانونية والخصوصية',
      supportTitle: 'الدعم والتواصل',
      links: {
        register: 'تسجيل مركز تدريب',
        login: 'دخول المراكز والموظفين',
        verify: 'التحقق من الشهادات',
        superAdmin: 'بوابة الإدارة العليا',
        privacy: 'سياسة الخصوصية',
        terms: 'شروط الاستخدام',
        cookies: 'سياسة ملفات الارتباط',
        dataProtection: 'حماية البيانات',
        contactUs: 'تواصل معنا',
        helpCenter: 'مركز المساعدة (FAQ)',
        support: 'طلب دعم فني',
      },
    },
    contactModal: {
      title: 'تواصل مع فريق المنصة',
      subtitle: 'هل لديك استفسار حول الباقات أو تفعيل مركز التدريب أو الربط التقني؟ أرسل رسالتك هنا.',
      name: 'الاسم الكامل',
      email: 'البريد الإلكتروني',
      phone: 'رقم الهاتف (اختياري)',
      company: 'اسم مركز التدريب / المؤسسة',
      subject: 'الموضوع',
      message: 'الرسالة',
      submit: 'إرسال الاستفسار',
      sending: 'جارٍ الإرسال...',
      successTitle: 'تم استلام رسالتك بنجاح',
      successBody: 'شكراً لتواصلك معنا. سيقوم فريق المنصة بمراجعة رسالتك والرد عليك قريباً.',
      close: 'إغلاق',
    },
  },
};
