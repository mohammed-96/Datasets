import { requireUser } from "@/lib/auth";
import { acceptRulesAction } from "./actions";

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await requireUser();
  const { next } = await searchParams;

  const rules = [
    "المزايدة نهائية بعد التأكيد ولا يمكن التراجع عنها.",
    "أعلى مزايدة صحيحة عند إغلاق المزاد هي الفائزة.",
    "الهوية الحقيقية للمزايدين مخفية عن بعضهم البعض، ويظهر فقط المعرف المستعار.",
    "مدير المزاد وحده يستطيع معرفة الهوية الحقيقية خلف كل حساب.",
    "يتم الاحتفاظ بسجل دائم لكل مزايدة، ولا يُحذف أي سجل من قاعدة البيانات.",
    "إذا تمت المزايدة خلال آخر دقيقتين (أو المدة المحددة) من المزاد، يُمدَّد المزاد تلقائيًا لمنع الفوز بمزايدة في آخر لحظة.",
    "في حال حدوث عطل تقني قرب نهاية المزاد، يمكن لمدير المزاد تعليق المزاد وتحديد موعد جديد لاستكماله، مع تسجيل ذلك في سجل العمليات.",
    "إذا لم يزايد أحد على قطعة، تبقى دون فائز ويقرر مدير المزاد كيفية التعامل معها لاحقًا.",
    "تسليم القطعة الفائز بها وتسوية قيمتها يتم خارج المنصة بالاتفاق المباشر مع مدير المزاد.",
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10">
      <h1 className="text-2xl font-extrabold text-neutral-900">قواعد المزاد</h1>
      <p className="mt-1 text-sm text-neutral-500">
        الرجاء قراءة القواعد التالية بعناية قبل المشاركة في أي مزايدة، مرحبًا {user.alias}.
      </p>

      <ol className="mt-6 list-decimal space-y-3 rounded-2xl border border-neutral-200 bg-white p-6 pr-10 text-sm leading-7 text-neutral-700 shadow-sm">
        {rules.map((rule, i) => (
          <li key={i}>{rule}</li>
        ))}
      </ol>

      <form action={acceptRulesAction} className="mt-6">
        <input type="hidden" name="next" value={next ?? "/"} />
        <button
          type="submit"
          className="w-full rounded-xl bg-amber-700 px-4 py-3 text-lg font-bold text-white transition hover:bg-amber-800"
        >
          قرأت وأوافق على قواعد المزاد
        </button>
      </form>
    </main>
  );
}
