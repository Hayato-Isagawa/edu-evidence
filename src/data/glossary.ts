export type GlossaryCategory =
  | "foundations"
  | "pedagogy"
  | "methodology"
  | "cognitive_science"
  | "critical_thinking"
  | "japan_context";

export interface GlossaryTerm {
  term: string;
  en: string;
  def: string;
  /** tooltip に使う短い定義(40文字以内推奨) */
  short: string;
  category: GlossaryCategory;
}

/**
 * 用語集データ。glossary.astro と remark-glossary プラグインで共用。
 * `short` はツールチップ用の短縮定義。
 */
export const glossary: GlossaryTerm[] = [
  { term: "エビデンス", en: "Evidence", short: "研究で確かめられた知見や根拠", def: "研究で確かめられた知見や根拠。個人の経験や印象ではなく、データに基づいて「効果がある/ない」を判断するための材料。本サイトでは主にメタ分析やRCTの結果を指す。エビデンスは「正解」ではなく「判断の材料」であり、教師の専門的判断と組み合わせて使うもの。", category: "foundations" },
  { term: "メタ分析", en: "Meta-analysis", short: "多数の研究を統計的に統合し全体の傾向を分析する手法", def: "同じテーマについて行われた数十〜数百本の研究を統計的に統合し、全体的な傾向を分析する手法。1本の研究では「たまたま」の可能性があるが、多数を統合すると信頼性が高くなる。本サイトの「+◯ヶ月」の多くはメタ分析から算出されている。", category: "foundations" },
  { term: "効果量", en: "Effect size", short: "「どのくらい効いたか」を数値化した指標", def: "「効果があった」だけでなく「どのくらい効いたか」を数値化した指標。代表的なのはコーエンのd。d=0.2で小さい効果、d=0.5で中程度、d=0.8で大きい効果。本サイトではd≈0.1を約1ヶ月に換算して表示している。", category: "foundations" },
  { term: "RCT", en: "Randomized Controlled Trial", short: "ランダム化比較試験。対象をくじ引きで2群に分け効果を比較", def: "ランダム化比較試験。対象者をくじ引き等でランダムに2群に分け、片方にだけ指導法を実施し、もう片方と比較する。ランダムに分けることで両群の条件(学力・家庭環境等)がほぼ同じになるため、差が出れば「指導法のおかげ」と言える。教育研究では倫理的・実務的な理由から実施が難しく、数が限られている。", category: "foundations" },
  { term: "クラスターRCT", en: "Cluster RCT", short: "学級・学校単位でランダム化するRCT。教育介入に適した設計", def: "学級・学年・学校といった集団(クラスター)単位でランダム化するRCT。個人単位ではランダム化できない教育介入(学級規模縮小・教科担任制・新カリキュラム等)に適した設計。伊芸研吾氏ら(2025、RIETI DP 25-J-029)の教科担任制の効果検証もこの設計。通常のRCTより多くの対象者が必要。", category: "foundations" },
  { term: "STAR", en: "Student/Teacher Achievement Ratio (Project STAR)", short: "米国テネシー州の少人数学級クラスターRCT(1985年開始の古典)", def: "米国テネシー州で 1985 年に開始された少人数学級効果の大規模クラスターRCT。79 校 7,000 人以上の児童を、少人数学級(13〜17 人)・通常学級(22〜25 人)・補助員付通常学級(22〜25 人+教員補助)の 3 群にランダム化し、幼稚園から第 3 学年まで継続観察。Mosteller(1995, The Future of Children 5(2):113-127)が結果を整理。少人数学級が早期の学習・認知に substantial improvement をもたらし、少数派児童への効果は majority の約 2 倍(後年は同程度)。少人数学級研究の古典的引用元。", category: "foundations" },
  { term: "システマティックレビュー", en: "Systematic review", short: "網羅的に文献を集め一定基準で質を評価する手法", def: "あるテーマについて、検索条件を明確にして網羅的に文献を収集し、一定の基準で質を評価する手法。「手当たり次第に探す」のではなく「漏れなく・偏りなく集める」点が通常の文献レビューと異なる。メタ分析の前段階として行われることが多い。", category: "foundations" },
  { term: "コーエンのd", en: "Cohen's d", short: "2群の平均差をばらつきで割った効果の大きさの指標", def: "2つのグループ(例：介入群と対照群)の平均点の差を、ばらつき(標準偏差)で割った値。教科や年齢が異なる研究同士でも効果の大きさを比較できる共通の物差し。d=0.2(小)、d=0.5(中)、d=0.8(大)が目安。", category: "foundations" },
  { term: "形成的評価", en: "Formative assessment", short: "学習途中で理解度を把握し指導を調整するための評価", def: "学習の途中で行う評価。通知表のための成績づけ(総括的評価)とは異なり、「今どこでつまずいているか」「次に何をすべきか」を教師と子どもが把握し、指導を調整するために行う。小テスト・ノートチェック・対話などが具体例。", category: "foundations" },
  { term: "メタ認知", en: "Metacognition", short: "「自分の思考について考える」力", def: "「自分の思考について考える」こと。「今の自分は何が分かっていて、何が分かっていないか」「この方法でうまくいっているか」を意識する力。EEF Toolkit で学習効果が最も高い領域の一つとされる。具体的な月数値は /strategies/metacognition を参照。", category: "pedagogy" },
  { term: "自己調整学習", en: "Self-regulated learning", short: "自分で目標を立て計画し振り返る学びのプロセス", def: "学習者が自分で目標を設定し、計画を立て、実行し、振り返り、次の学びにつなげるプロセス。メタ認知が土台。「やらされる勉強」から「自分で進める学び」への転換。", category: "pedagogy" },
  { term: "足場かけ", en: "Scaffolding", short: "段階的に支援し、できるにつれて支援を減らす指導法", def: "子どもが一人ではできないことに取り組むとき、教師がヒント・手順の分解・モデルの提示などで段階的に支援し、できるようになるにつれて支援を外していくこと。", category: "pedagogy" },
  { term: "フィードバック", en: "Feedback", short: "学びに対して「何がよかったか・次はどうするか」を返すこと", def: "学びや行動に対して具体的な情報を返すこと。「何がよかったか」「次はどうするか」を伝える。", category: "pedagogy" },
  { term: "協同学習", en: "Cooperative learning", short: "小グループで役割を持って学び合う指導法", def: "子ども同士が小グループで役割を持って学び合う指導法。全員が貢献する設計が鍵。", category: "pedagogy" },
  { term: "SEL", en: "Social and Emotional Learning", short: "社会性と情動の学習。自己理解・対人スキル等の5領域", def: "社会性と情動の学習。自己理解・自己管理・他者理解・対人スキル・意思決定の5領域からなる。", category: "pedagogy" },
  { term: "非認知能力", en: "Non-cognitive skills", short: "テストで測れない力(粘り強さ・自制心・協調性等)", def: "テストの点数では測れない力の総称。粘り強さ(グリット)、自己効力感、協調性、自制心、好奇心などが含まれる。", category: "pedagogy" },
  { term: "GIGAスクール構想", en: "GIGA School Program", short: "児童生徒1人1台端末と高速ネットを整備する国策", def: "「Global and Innovation Gateway for All」の略。児童生徒1人1台端末と高速ネットワークを整備する日本の国策。2020年度にコロナ禍で加速的に展開。", category: "japan_context" },
  { term: "出版バイアス", en: "Publication bias", short: "「効果あり」の研究が出版されやすく全体を歪める傾向", def: "「効果があった」研究は学術誌に発表されやすく、「効果がなかった」研究はお蔵入りしやすい傾向。メタ分析に含まれる研究が「効果あり」に偏り、全体の効果が過大評価される原因になる。", category: "foundations" },
  { term: "SES", en: "Socioeconomic Status", short: "社会経済的地位(保護者の学歴・収入等)", def: "社会経済的地位。保護者の学歴・収入・職業などで構成される指標。松岡亮二氏の研究で、日本でもSESと学力の間に強い相関があることが実証されている。", category: "japan_context" },
  { term: "SSW", en: "School Social Worker", short: "学校現場で社会福祉の専門知識を提供する専門職。文科省事業で配置", def: "スクールソーシャルワーカー。学校現場で社会福祉の専門知識・技術を活用し、いじめ・不登校・暴力行為・児童虐待などの問題解決にあたる専門職。文部科学省の「スクールソーシャルワーカー活用事業」で配置され、児童生徒の問題行動の背景にある家庭・友人関係・地域・学校など環境要因に働きかけ、学校と関係機関(福祉・医療・司法等)との連携を担う。スクールカウンセラー(SC、心理職)とは別の社会福祉職。", category: "japan_context" },
  { term: "FSM", en: "Free School Meals", short: "英国の無償給食制度。受給資格は低SES児童のサブグループ指標として使われる", def: "英国の公立学校における無償給食制度(Free School Meals)。受給資格(FSM eligible)は所得・福祉受給状況により決まる。教育研究では「低SES児童」のプロキシ指標として広く使われ、EEFのメタ分析や政府委託研究で「FSM児童」を独立サブグループとして効果量を報告する慣習がある。日本の「就学援助受給者」に概念的に近いが、運用基準は異なる。", category: "foundations" },
  { term: "EEF", en: "Education Endowment Foundation", short: "英国の教育研究財団。本サイトの主要参照元", def: "英国の教育研究財団。2011年設立。Teaching and Learning Toolkitで30以上の指導法を効果量・エビデンスの強さ・コストで評価し公開。本サイトの主要な参照元。", category: "foundations" },
  { term: "Visible Learning", en: "Visible Learning", short: "Hattie による800以上のメタ分析を統合した教育研究。効果量で指導法を順位づけ", def: "ジョン・ハッティ(John Hattie)が800以上のメタ分析を統合し、250以上の要因を効果量(d値)で順位づけした教育研究プロジェクト。影響力は大きいが、効果量が楽観的に出やすい傾向があり、独立した再現が限定的な値もある。本サイトではEEFを主とし、Hattieは参考値として併記している。", category: "foundations" },
  { term: "認知負荷理論", en: "Cognitive load theory", short: "ワーキングメモリの限界を考慮して教え方を最適化する理論", def: "ジョン・スウェラーが提唱。ワーキングメモリの容量には限界があるため、教える内容を整理して認知的負担を最適化することが学びの効率を上げる、という理論。", category: "cognitive_science" },
  { term: "ワーキングメモリ", en: "Working memory", short: "数秒間だけ情報を保持・処理する短期記憶。容量に限界あり", def: "数秒間だけ情報を保持・処理する短期的な記憶領域。容量が小さく、同時に扱える情報は4±1個程度とされる。", category: "cognitive_science" },
  { term: "ZPD", en: "Zone of Proximal Development", short: "一人ではできないが支援があればできる領域(ヴィゴツキー)", def: "ヴィゴツキーが提唱。「一人ではできないが、適切な支援があればできる」領域。足場かけの理論的根拠。", category: "cognitive_science" },
  { term: "学習指導要領", en: "Course of Study", short: "文部科学省が告示する全国共通の教育課程の基準", def: "文部科学省が告示する全国共通の教育課程の基準。約10年ごとに改訂される。現行版(2017年告示)の核は「主体的・対話的で深い学び」と「資質・能力の三つの柱」。", category: "japan_context" },
  { term: "学力格差", en: "Achievement gap", short: "家庭背景・地域等により学力が異なる現象", def: "子どもの学力が家庭背景・地域・学校等の要因で異なる現象。日本でもSESによる学力格差は明確に存在する。", category: "japan_context" },
  { term: "教育格差", en: "Educational disparity", short: "「生まれ」で教育結果(学力・進学率・学歴等)に差が生じる現象", def: "家庭のSES・地域・性別など「個人が選べない属性」によって、教育結果(学力・進学率・学歴・文化資本)に差が生まれる現象。松岡亮二氏『教育格差』(ちくま新書, 2019)が日本におけるSES・地域・性別の影響を包括的に実証し、日本を「緩やかな身分社会」として論じた。学力格差(Achievement gap)より広い概念で、学力だけでなく進路選択・教育投資の世代間継承までを含む。", category: "japan_context" },
  { term: "ICT", en: "Information and Communication Technology", short: "情報通信技術。PC・タブレット・ネット等の活用", def: "情報通信技術。教育分野ではPC・タブレット・インターネット等を活用した指導・学習を指す。GIGAスクール構想で1人1台端末が整備された。", category: "japan_context" },
  { term: "PISA", en: "Programme for International Student Assessment", short: "OECDの国際学力調査(15歳対象・3年ごと)", def: "OECDが3年ごとに実施する国際学力調査。15歳(日本では高1)を対象に、読解力・数学的リテラシー・科学的リテラシーを測定。日本の教育政策に大きな影響を与える。", category: "japan_context" },
  { term: "TIMSS", en: "Trends in International Mathematics and Science Study", short: "IEA が 4 年ごとに実施する国際数学・理科学習到達度調査(小4・中2 対象)", def: "国際教育到達度評価学会(IEA)が 1995 年から 4 年ごとに実施する国際数学・理科学習到達度調査。第 4 学年と第 8 学年(日本では小 4 と中 2)が対象、各教育システムで 4,000〜5,000 人の生徒を評価する。Boston College Lynch School の TIMSS & PIRLS International Study Center が運営。PISA(15 歳・リテラシー型)とは異なり教育課程準拠型(curriculum-based)で、各国のカリキュラム内容の習得度を測る点が特徴。", category: "foundations" },
  { term: "OECD", en: "Organisation for Economic Co-operation and Development", short: "経済協力開発機構。PISAやTALISを実施", def: "経済協力開発機構。38カ国が加盟。教育分野ではPISA(学力調査)やTALIS(教員調査)を実施し、各国の教育政策に影響を与える。", category: "japan_context" },
  { term: "TALIS", en: "Teaching and Learning International Survey", short: "OECD が 5 年ごとに実施する国際教員指導環境調査", def: "OECD が 2008 年から実施する国際教員指導環境調査(Teaching and Learning International Survey)。教員と校長の 2 種類の質問紙で、職務背景・労働環境・職能開発・信念と態度を国際比較する。世界最大の教員調査で、国際的に教員の代表サンプルを集める唯一の調査。日本の教員長時間労働が国際比較で浮き彫りになる主要データソース。TALIS 2024 では 55 教育システム 28 万教員が回答。", category: "japan_context" },
  { term: "教育経済学", en: "Economics of Education", short: "経済学の手法(RCT・統計)で教育の効果を分析する学問", def: "経済学の手法(RCT・統計分析)を使って教育の効果や費用対効果を分析する学問分野。日本では中室牧子氏(慶應義塾大学)が代表的。", category: "foundations" },
  { term: "検索練習", en: "Retrieval practice", short: "思い出す練習で記憶を強化する学習法(テスト効果)", def: "学んだことを後から思い出す練習。ノートを読み返すより「何だっけ?」と思い出す方が記憶が定着する。テスト効果とも呼ばれる。", category: "cognitive_science" },
  { term: "分散学習", en: "Spaced practice", short: "間隔を空けて繰り返す方が記憶に残る学習法", def: "学習を間隔を空けて何度も実施すること。一夜漬けより毎日少しずつ復習する方が長期記憶に残る。", category: "cognitive_science" },
  { term: "交互練習", en: "Interleaving", short: "異なる種類を混ぜて練習する方が応用力が育つ", def: "複数の問題タイプを混ぜて練習すること。ブロック学習(同じタイプを連続)より長期的な定着と応用力が高まる。", category: "cognitive_science" },
  { term: "二重符号化", en: "Dual coding", short: "言葉+図の両方で学ぶと記憶が強化される", def: "言語と視覚イメージの両方で情報を処理すると記憶が強化される理論。図解やスケッチノートが効果的な理由を説明する。", category: "cognitive_science" },
  { term: "自己効力感", en: "Self-efficacy", short: "「自分はこれができる」という信念(バンデューラ)", def: "アルバート・バンデューラが提唱。「自分はこれができる」という信念。能力そのものより効力感の高さが行動と成果を予測する。", category: "pedagogy" },
  { term: "成長マインドセット", en: "Growth mindset", short: "「能力は努力で伸ばせる」という信念(ドゥエック)", def: "「能力は努力や戦略で伸ばせる」という信念。キャロル・ドゥエックが提唱。ただしSisk et al.(2018)のメタ分析では学力との関連はr=0.10と非常に小さい。", category: "pedagogy" },
  { term: "探究学習", en: "Inquiry-based learning", short: "子ども自ら問いを立て調べ考える学習", def: "子どもが自ら問いを立て、調べ、考え、まとめ、表現する学習。総合的な学習の時間の核。", category: "pedagogy" },
  { term: "STEM", en: "Science, Technology, Engineering, and Mathematics", short: "科学・技術・工学・数学を統合的に扱う理系教育の概念", def: "科学(Science)・技術(Technology)・工学(Engineering)・数学(Mathematics)の頭文字。理系教育を統合的に扱う概念で、米国国立科学財団(NSF)が 2001 年に正式採用したのが起源(それ以前は SMET と呼ばれていた)。日本では文部科学省・経済産業省が普及を推進している。教育研究では「STEM 領域での介入効果」という研究分類としても使われる。", category: "pedagogy" },
  { term: "PBL", en: "Project-Based Learning", short: "プロジェクト型学習。長期的・協働的に現実課題に取り組む指導法", def: "プロジェクト型学習(Project-Based Learning)。子どもが現実世界の課題に対して、調査・計画・制作・発表を長期的・協働的に進める指導法。アクティブラーニングの代表的な一形態。EEFが評価した\"Learning through REAL projects\"トライアルでは、リテラシーへのポジティブな影響は確認されず、FSM受給対象児童には負の影響が示唆されている(ただし学校脱落が多く、解釈には注意が必要)。", category: "pedagogy" },
  { term: "交絡変数", en: "Confounding variable", short: "関心ある2変数の両方に影響する『隠れた第三の変数』", def: "関心のある2つの変数(例:朝食と学力)の両方に影響する、隠れた第三の変数。家庭のSESは朝食習慣と学力の双方に影響しうるため、統制しないと『朝食が学力を上げた』という誤った因果推論につながる。観察研究の最大の難所であり、RCTはランダム化により交絡を除去できる点で強力。日本疫学会の定義では(1)アウトカムに影響を与える、(2)要因と関連がある、(3)要因とアウトカムの中間因子でない、の3条件を満たす変数を指す。", category: "methodology" },
  { term: "逆因果", en: "Reverse causality", short: "原因と結果の向きが想定と逆である可能性", def: "「AがBを引き起こす」と解釈される関係が、実際には「BがAを引き起こしている」可能性を指す。例:「読書量が多い子は学力が高い」という相関から「読書が学力を上げる」と解釈しがちだが、実際は「学力が高い子が読書を好む」という逆方向の因果が働いている可能性がある。観察研究では逆因果を排除できず、因果推論にはRCTや縦断デザイン等の工夫が必要。", category: "methodology" },
  { term: "因果関係", en: "Causation", short: "「AがBを引き起こす」という原因-結果の関係", def: "「AがBを引き起こす」という原因と結果の関係。単なる相関(AとBが同時に変化する)とは異なり、Aを変化させたときBも変化することを示す。因果関係を確認するにはRCT(ランダム化比較試験)・縦断研究・自然実験などの手法が必要で、観察研究だけでは逆因果や交絡変数の可能性を排除できない。", category: "foundations" },
  { term: "相関", en: "Correlation", short: "2つの変数が一緒に変化する関係。因果の証明ではない", def: "2つの変数が同時に変化する関係性のこと。AとBの間に相関があるとは、Aが大きいときBも大きい(または小さい)傾向があることを意味する。ただし相関は因果関係を意味せず、逆因果や交絡変数の可能性も残る。因果の証明にはRCTや縦断デザイン等の別の手法が必要。", category: "foundations" },
  { term: "デジタルシティズンシップ教育", en: "Digital citizenship education", short: "デジタル技術を善く使う市民を育てる教育。情報モラルの次世代型", def: "デジタル技術を使って社会に参加し、責任ある行動をとる『善き市民』を育てる教育。従来の情報モラル教育が『危険を避けるルール・マナー』を教える禁止型だったのに対し、デジタルシティズンシップ教育は『技術を主体的に使いこなし社会に参加する』という育成型のアプローチ。日本では坂本旬氏(法政大学)らが普及を主導している。", category: "japan_context" },
  { term: "CASEL", en: "Collaborative for Academic, Social, and Emotional Learning", short: "SELの5領域フレームを定義した米国の組織", def: "Collaborative for Academic, Social, and Emotional Learningの略。米国を拠点とするSEL研究・普及の組織で、SELの5つの中核能力(自己認識・自己管理・社会的認識・対人関係スキル・責任ある意思決定)を定義した枠組みを提供している。本サイトのSEL関連ページもこの枠組みに準拠している。", category: "pedagogy" },
  { term: "神経神話", en: "Neuromyth", short: "脳科学の研究が誤解・誇張されて広まった通説。教育界に多い", def: "脳科学の研究結果が一般化・単純化される過程で生まれた、科学的根拠のない通説。「右脳/左脳タイプ」「学習スタイル(VARK)」「脳の10%しか使っていない」などが代表例。OECD (2002) の報告書で概念化され、Howard-Jones (2014) などで体系的に整理されている。教員研修や保護者向け教育情報で繰り返し再生産される傾向がある。", category: "critical_thinking" },
  { term: "疑似科学", en: "Pseudoscience", short: "科学を装うが方法論を欠く主張。教育界では学習スタイル等が該当", def: "科学的根拠があるかのように主張されるが、反証可能性・体系的検証・専門家による吟味といった科学的方法を欠く言説。Popper の反証可能性概念や Bunge (1984) の定義「科学を装う誤り(error parading as science)」が哲学的基盤。教育文脈では学習スタイル(VARK)、多重知能理論、心の知能指数(EQ)などが代表的批判対象で、Waterhouse (2006) や Pashler ら (2009) が実証的根拠不足を体系的に指摘している。神経神話は脳科学領域に特化した疑似科学の一種で、本概念の方が射程が広い。", category: "critical_thinking" },
  { term: "マスタリーラーニング", en: "Mastery learning", short: "全員が一定の到達基準に達してから次に進む学習方式", def: "全員が一定の到達基準に達してから次に進む学習方式。理解の差を時間で吸収する。", category: "pedagogy" },
  { term: "ピア・チュータリング", en: "Peer tutoring", short: "子ども同士のペアで教え合う指導法", def: "子ども同士がペアになり、教え合う指導法。教える側にも学ぶ側にも効果がある。", category: "pedagogy" },
  { term: "UDL", en: "Universal Design for Learning", short: "全員が分かる授業を設計する手法。視覚化・焦点化・共有化の3原則", def: "授業のユニバーサルデザイン(授業UD)。日本では桂聖氏ら(2011)が CAST(米国)の Universal Design for Learning を踏まえ独自に発展させた、すべての子が分かる授業設計の手法。視覚化・焦点化・共有化の3原則。", category: "pedagogy" },
  { term: "研究授業", en: "Lesson Study", short: "教師が協働で授業を計画・実施・検討する日本発の研修手法", def: "教師が協働で授業を計画し、1人が実施、他が観察・検討する日本発の研修手法。世界にLesson Studyとして輸出された。", category: "pedagogy" },
  { term: "反転授業", en: "Flipped classroom", short: "家で動画でインプット、教室で対話・演習に集中する授業形態", def: "家庭で動画等により知識をインプットし、教室では対話・演習に集中する授業形態。", category: "pedagogy" },
  { term: "特別活動", en: "Tokkatsu", short: "学級活動・児童会・クラブ・学校行事で自治的な力を育てる日本固有の領域", def: "学級活動・児童会活動・クラブ活動・学校行事を通じて自治的な力を育てる日本固有の教育領域。略称「特活」。", category: "japan_context" },
  { term: "標準偏差", en: "Standard deviation", short: "データのばらつきを示す指標(効果量計算でも使う)", def: "データのばらつきを示す指標。同じ平均点でも、ばらつきが小さければ「みんな似た水準」、大きければ「個人差が大きい」を意味する。効果量(コーエンのd)の計算でも使われる。", category: "methodology" },
  { term: "ANCOVA", en: "Analysis of Covariance", short: "共分散分析。共変量を統制してグループ間の平均差を比較する手法", def: "共分散分析(Analysis of Covariance)。分散分析(ANOVA)に連続変数の共変量を加え、その影響を統計的に統制した上でグループ間の平均差を検定する手法。教育研究のRCTでは介入前テスト得点を共変量にして介入群と対照群の事後得点を比較するのが典型で、ベースラインのばらつきを除去できるため検出力が高い。", category: "methodology" },
  { term: "信頼区間", en: "Confidence interval", short: "推定値が収まる範囲を示す統計的『幅』。狭いほど精度が高い", def: "推定値が収まる範囲を示す統計的な「幅」。例:「効果は+5ヶ月、95%信頼区間は+2〜+8ヶ月」とあれば、真の効果は2〜8ヶ月の範囲に収まる確率が95%という意味。狭い信頼区間ほど推定の精度が高い。", category: "methodology" },
  { term: "p値", en: "p-value", short: "効果がない場合に観察された差以上が偶然起きる確率。0.05未満で有意", def: "「もし本当は効果がないとしたら、観察された差以上の差が偶然起きる確率」。一般に0.05未満なら「統計的に有意」とされる。ただし「効果が大きい」を意味するわけではない点に注意。", category: "methodology" },
  { term: "統計的有意性", en: "Statistical significance", short: "観察された差が偶然では起きにくいと判断できること。p<0.05が慣例", def: "観察された差が「偶然では起きにくい」と判断できること。p<0.05が慣例。「統計的に有意 ≠ 実用的に意味がある」点に注意。サンプルが大きいと小さな差でも有意になる。", category: "methodology" },
  { term: "選択バイアス", en: "Selection bias", short: "対象者の偏りで結果が歪む現象。RCTのランダム化で防げる", def: "研究の対象者が「典型」から偏ることで結果が歪む現象。例:「やる気のあるクラスだけを介入群にする」と効果が過大評価される。RCTはランダム化でこれを防ぐ。", category: "methodology" },
  { term: "DiD", en: "Difference-in-differences", short: "介入前後の変化を介入群と非介入群で比較する因果推論手法", def: "差分の差分(Difference-in-differences)。因果推論の手法で、介入前後の変化を介入群と非介入群で比較し、両者の差から介入の純粋な効果を推定する。RCTができない場合の代替手段で、教育政策の評価でよく使われる。", category: "methodology" },
  { term: "quasi-experimental", en: "Quasi-experimental design", short: "準実験。ランダム化ができない場合の因果推論用研究デザイン", def: "準実験デザイン(Quasi-experimental design)。ランダム化が倫理的・実務的に困難な状況で因果推論を試みる研究手法群の総称。傾向スコアマッチング、差分の差分(DiD)、回帰不連続デザイン(RDD)、操作変数法などを含む。RCTより信頼性は劣るが、教育政策評価で現実的な選択肢として広く使われる。", category: "methodology" },
  { term: "回帰不連続デザイン", en: "Regression discontinuity design", short: "基準値前後の比較で介入の効果を取り出す因果推論手法", def: "ある基準値の前後で介入の有無が決まる場合に使う因果推論手法。例:「合格点ぎりぎりで合格した子」と「ぎりぎりで不合格だった子」を比較すれば、合格の効果がほぼ純粋に取り出せる。", category: "methodology" },
  { term: "学習科学", en: "Learning sciences", short: "認知心理学・神経科学等を統合し『人はどう学ぶか』を解明する学際領域", def: "認知心理学・神経科学・教育学・コンピューター科学などを統合し、「人はどう学ぶか」を解明する学際領域。1990年代以降に発展。エビデンスベース教育の理論基盤の一つ。", category: "cognitive_science" },
  { term: "ピグマリオン効果", en: "Pygmalion effect", short: "教師の期待が学力に影響する現象(ローゼンタール)。再現性に議論あり", def: "教師の期待が子どもの学力に影響する現象。「この子はできる」と教師が期待すると、その子の成績が実際に上がる、というローゼンタールとジェイコブソン(1968)の古典的研究。逆に否定的期待が下げる場合(ゴーレム効果)もある。ただし近年の追試・メタ分析では効果量が小さく、当初の主張ほど大きな因果効果は再現されていない。教育用語として広く認知されている一方で「強い介入効果を持つ現象」とは扱われない。", category: "cognitive_science" },
  { term: "グリット", en: "Grit", short: "やり抜く力(ダックワース)。近年は効果が限定的との指摘", def: "アンジェラ・ダックワースが提唱した「やり抜く力」。長期目標への情熱と粘り強さ。当初は学力との強い関連が話題になったが、Credé et al. (2018) のメタ分析(Big Five との重複や効果量の小ささを指摘)など近年の研究では効果が限定的で、SES等の交絡を除くと効果は小さいことが指摘されている。", category: "cognitive_science" },
  { term: "全国学力・学習状況調査", en: "National Assessment of Academic Ability", short: "文部科学省が毎年実施する全国学力調査(小6・中3対象)", def: "文部科学省が毎年実施する学力調査。小6と中3が対象で、国語・算数(数学) は毎年、理科は概ね3年に1回、中学校英語(中3のみ) は概ね3年に1回測定する。学力の地域差や経年変化のデータソースとして重要。", category: "japan_context" },
  { term: "インクルーシブ教育", en: "Inclusive education", short: "障害の有無を問わず共に学ぶ教育。合理的配慮が義務化", def: "障害の有無や特別なニーズに関わらず、すべての子どもが共に学ぶ教育。日本でも合理的配慮が義務化され、通常学級での個別最適化が課題になっている。", category: "japan_context" },
];

/** ツールチップ対象の用語だけ。本文中で自動検出に使う */
export const tooltipTerms = glossary.map((t) => t.term);
