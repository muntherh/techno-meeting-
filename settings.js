/*
 * ───────────────────────────────────────────────────────────────
 *  إعدادات العرض — عدّل هنا فقط
 *  Presentation settings — edit only this file
 * ───────────────────────────────────────────────────────────────
 *  - اترك القيمة فارغة '' لتظهر في العرض كـ «يُحدَّد لاحقًا».
 *  - روابط النماذج: ضع رابط Google Form لكل لجنة، ويُنشأ رمز QR تلقائيًا (بدون إنترنت).
 *  - نصوص الشرائح نفسها موجودة في index.html (كل مشهد في <section> خاص به).
 */
window.TECHNO_SETTINGS = {
  theme: 'techno',         // الألوان الافتراضية: 'techno' أو 'club' (النادي العلمي) — يمكن التبديل أثناء العرض بزر الألوان أو T
  meeting: {
    date: 'نوفمبر ٢٠٢٦',
  },

  specialization: {       // يوم التخصصات — Specialization Day
    date: '١٨–١٩ نوفمبر ٢٠٢٦',
    place: '',
  },

  portrait: {             // تصوير البورتريه — Portrait Day
    date: '',
    place: '',
  },

  cables: {               // واير وشاحن… تدوير آمن
    place: '',            // نقطة التجميع
    period: '',           // فترة التجميع
  },

  projects: {             // مشروعك بصورة أحلى
    date: '',
    contact: '',          // رقم/رابط التسجيل والاستفسار
  },

  workshops: {            // ورش خدمة المجتمع
    date: '',
  },


  recruitment: {          // فتح التسجيل في اللجان
    date: '',
  },

  game: {                 // لعبة تكنو — TECHNO Air Code (مشهد «لعبة تكنو»)
    // رمز QR في المشهد هو الرمز الرسمي للعبة ويشير إلى هذا الرابط؛ إن تغيّر الرابط فاستبدل assets/img/game-qr.png
    url: 'https://game-1-lovat-zeta.vercel.app/',
  },

  forms: {                // روابط نماذج الانضمام (Google Forms)
    events: '',
    relations: '',
    media: '',
  },
};
