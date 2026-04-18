export interface Concern {
  slug: string;
  title: string;
  diagnosis: string;
  strategies: string[];
  columns?: string[];
}

export interface ConcernCategory {
  id: string;
  title: string;
  description: string;
  concerns: Concern[];
}

export const concernCategories: ConcernCategory[] = [
  {
    id: "classroom-management",
    title: "学級経営",
    description: "教室全体の秩序・雰囲気・人間関係の悩み",
    concerns: [
      {
        slug: "classroom-unrest",
        title: "学級が落ち着かない・荒れている",
        diagnosis:
          "全体への一律指導より、困っている子への個別対応の方が効率的というのが EEF の知見。教師と子どもの関係性を土台に、行動への明示的な働きかけと SEL を重ねる。",
        strategies: [
          "teacher-student-relationships",
          "behaviour-interventions",
          "social-emotional-learning",
          "classroom-discussion",
        ],
        columns: ["school-refusal-crisis"],
      },
      {
        slug: "bullying",
        title: "いじめ・仲間はずれが心配",
        diagnosis:
          "認知件数の増加は『見える化の進展』という側面もある。予防は SEL と教師との関係性の土台づくり。対応は行動への働きかけを個別計画で。",
        strategies: [
          "social-emotional-learning",
          "teacher-student-relationships",
          "behaviour-interventions",
        ],
        columns: ["bullying-recognition-paradox"],
      },
      {
        slug: "online-game-trouble",
        title: "ゲーム・SNS 絡みのトラブル",
        diagnosis:
          "禁止だけでは不十分。ゲーム内の出来事を『現実の人間関係』として扱い、SEL と行動介入の枠組みで受け止める。",
        strategies: [
          "social-emotional-learning",
          "behaviour-interventions",
          "screen-time",
          "social-media-mental-health",
        ],
        columns: ["brainrot-classroom-response", "brainrot-science-check"],
      },
    ],
  },
  {
    id: "teaching",
    title: "授業",
    description: "学習・理解・主体性に関する悩み",
    concerns: [
      {
        slug: "passive-class",
        title: "子どもが集中しない・受け身",
        diagnosis:
          "明確なフィードバックと、自分の学びを振り返るメタ認知が主体性の土台。協同学習と対話で『話す/聞く/考える』の回路を増やす。",
        strategies: [
          "feedback",
          "metacognition",
          "classroom-discussion",
          "cooperative-learning",
        ],
        columns: ["active-deep-learning-evidence"],
      },
      {
        slug: "achievement-gap",
        title: "学力差が大きい・つまずきがある",
        diagnosis:
          "少人数指導と足場かけで、子どものつまずきの段階に応じた支援を。個別計画は『困難の大きい子』に焦点を絞る方が効率的。",
        strategies: [
          "small-group-tuition",
          "one-to-one-tuition",
          "scaffolding",
          "individualised-instruction",
        ],
        columns: ["class-size-cost-effectiveness", "giga-school-evidence"],
      },
      {
        slug: "reading-difficulty",
        title: "読解力に不安・問題文が読めない",
        diagnosis:
          "読解戦略の明示的指導と口頭言語の土台づくりが鍵。低学年からの積み上げで後の学力全般が伸びる。",
        strategies: [
          "reading-comprehension",
          "reciprocal-teaching",
          "oral-language",
          "phonics",
        ],
        columns: ["reading-quantity-myth"],
      },
      {
        slug: "shallow-dialogue",
        title: "対話が特定の子に偏る・深まらない",
        diagnosis:
          "構造化された対話(dialogic teaching)は単なる『話し合い』とは別物。問いの質・応答連鎖・理由付けを意図的に設計する。",
        strategies: [
          "classroom-discussion",
          "oral-language",
          "cooperative-learning",
          "reciprocal-teaching",
        ],
        columns: ["active-deep-learning-evidence"],
      },
    ],
  },
  {
    id: "individual-support",
    title: "個別支援",
    description: "特別支援・多様な背景をもつ子への関わり",
    concerns: [
      {
        slug: "special-needs",
        title: "通常学級の特別支援を要する子(8.8%)",
        diagnosis:
          "『特別な指導』より、質の高い通常授業(足場かけ・フィードバック・UDL・メタ認知)が基盤。そのうえで個別の計画を重ねる。",
        strategies: [
          "scaffolding",
          "feedback",
          "universal-design-learning",
          "one-to-one-tuition",
          "metacognition",
        ],
        columns: ["special-needs-8-8-percent"],
      },
      {
        slug: "inequality",
        title: "家庭環境・体験格差への学校の役割",
        diagnosis:
          "家庭ではまかないにくい経験を、特別活動・屋外学習・芸術・SEL で学校が提供する。エビデンスが後押しする学校の役割は大きい。",
        strategies: [
          "social-emotional-learning",
          "outdoor-learning",
          "tokkatsu",
          "arts-participation",
        ],
        columns: [
          "education-inequality-evidence",
          "school-lunch-free",
          "experience-gap-school-role",
        ],
      },
    ],
  },
  {
    id: "family-connection",
    title: "家庭との接続",
    description: "宿題・家庭学習・保護者連携",
    concerns: [
      {
        slug: "homework-design",
        title: "宿題の出し方・家庭学習が定着しない",
        diagnosis:
          "量より設計。分散学習と検索練習の形で出すと定着が伸びる。フィードバックで『出しっぱなし』にしないことも重要。",
        strategies: [
          "spaced-practice",
          "retrieval-practice",
          "feedback",
          "homework",
        ],
        columns: ["homework-quantity-myth"],
      },
      {
        slug: "parent-communication",
        title: "保護者会・保護者連携で悩む",
        diagnosis:
          "保護者との連携は EEF +4ヶ月。情報提供の質と、家庭と学校が『同じ方向を向く』仕組みづくりが効く。",
        strategies: ["parental-engagement"],
        columns: ["joint-custody-school-impact"],
      },
    ],
  },
  {
    id: "teacher-career",
    title: "教員自身のキャリア",
    description: "新任・若手の入門と、避けるべき指導法",
    concerns: [
      {
        slug: "beginner-entry",
        title: "若手・新任でどこから始めるか",
        diagnosis:
          "効果とコストのバランスから選ぶ。フィードバックとメタ認知は低コストで効果が大きく、最初の一歩に向く。読解・口頭言語・フォニックスは低学年での土台づくりに。",
        strategies: [
          "feedback",
          "metacognition",
          "reading-comprehension",
          "oral-language",
          "phonics",
        ],
        columns: ["beginner-teacher-entry"],
      },
      {
        slug: "avoid-ineffective",
        title: "効果が薄い/負の指導法を避けたい",
        diagnosis:
          "留年・体罰・学習スタイル適応は効果がゼロまたは負。スクリーンタイム長時間も負の関連。エビデンスから『やめどき』を見直す。",
        strategies: [
          "repeating-a-year",
          "corporal-punishment",
          "learning-styles",
          "screen-time",
        ],
        columns: [
          "finland-education-myth",
          "grit-reconsidered",
          "brainrot-science-check",
          "chatgpt-cognitive-crutch",
        ],
      },
    ],
  },
];
