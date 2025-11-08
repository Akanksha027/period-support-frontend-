import React from "react"
import { ScrollView, View, Text, StyleSheet, Dimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const TIMELINE_WIDTH = SCREEN_WIDTH - 64

interface PhaseStep {
  id: string
  title: string
  description: string
  mood: string
}

interface PhaseSection {
  id: string
  title: string
  subtitle: string
  tone: {
    accent: string
  }
  steps: PhaseStep[]
}

const hexToRgba = (hex: string, alpha: number): string => {
  const sanitized = hex.replace("#", "")
  const bigint = parseInt(sanitized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const PHASE_SECTIONS: PhaseSection[] = [
  {
    id: "menstrual",
    title: "Menstrual Phase",
    subtitle: "Shedding the lining and resetting hormones",
    tone: {
      accent: "#8A3C58",
    },
    steps: [
      {
        id: "m1",
        title: "Bleeding",
        description: "Progesterone and estrogen levels drop, triggering the uterine lining to shed.",
        mood: "Energy is low. Rest with gentle stretching, tea, and warmth.",
      },
      {
        id: "m2",
        title: "Cramps and pain",
        description: "Prostaglandins squeeze the uterus to release menstrual tissue.",
        mood: "Heat packs, hydration, and slow breathing ease cramps.",
      },
      {
        id: "m3",
        title: "Fatigue",
        description: "Iron reserves drop while the body releases blood and tissue.",
        mood: "Quiet mornings and nourishing meals rebuild strength.",
      },
      {
        id: "m4",
        title: "Hormone drop",
        description: "Both estrogen and progesterone reach their lowest point and reset.",
        mood: "Emotions feel reflective. Journaling supports a calm reset.",
      },
      {
        id: "m5",
        title: "Endometrium sheds",
        description: "The lining completely releases over three to seven days.",
        mood: "Mindful rest and comfort care keep the body grounded.",
      },
    ],
  },
  {
    id: "follicular",
    title: "Follicular & Proliferative",
    subtitle: "Preparing a new egg and rebuilding the uterine lining",
    tone: {
      accent: "#3F7C6E",
    },
    steps: [
      {
        id: "f1",
        title: "FSH rises",
        description: "Follicle-stimulating hormone recruits ovarian follicles that hold immature eggs.",
        mood: "Focus returns softly. Planning feels easier.",
      },
      {
        id: "f2",
        title: "Estrogen rises",
        description: "Growing follicles release estrogen, thickening the uterine lining.",
        mood: "Skin brightens and motivation builds.",
      },
      {
        id: "f3",
        title: "Dominant follicle",
        description: "One follicle becomes dominant while others pause.",
        mood: "Clarity and confidence grow. Set new goals.",
      },
      {
        id: "f4",
        title: "Lining rebuilds",
        description: "Blood vessels and tissue regrow to welcome a future embryo.",
        mood: "Body feels resilient. Balanced workouts feel great.",
      },
      {
        id: "f5",
        title: "Energy increases",
        description: "Rising estrogen supports steady stamina and balanced blood sugar.",
        mood: "Great window for teamwork, networking, and new projects.",
      },
      {
        id: "f6",
        title: "Mood improves",
        description: "Serotonin and dopamine levels rise for a positive mindset.",
        mood: "Creativity flows. Try challenging tasks.",
      },
      {
        id: "f7",
        title: "Clearer skin",
        description: "Lower sebum and balanced hormones calm the complexion.",
        mood: "Self-confidence glows. Capture photos or attend events.",
      },
    ],
  },
  {
    id: "ovulation",
    title: "Ovulation",
    subtitle: "Releasing the mature egg and opening the fertile window",
    tone: {
      accent: "#BC8E2C",
    },
    steps: [
      {
        id: "o1",
        title: "LH surge",
        description: "A dramatic rise in luteinizing hormone triggers ovulation within twenty-four hours.",
        mood: "Sociability peaks. Schedule presentations or dates.",
      },
      {
        id: "o2",
        title: "Peak estrogen",
        description: "Estradiol reaches its highest level and supports cervical fluid changes.",
        mood: "Confidence and charisma shine. Conversations feel effortless.",
      },
      {
        id: "o3",
        title: "Egg released",
        description: "The dominant follicle ruptures and releases the egg into the fallopian tube.",
        mood: "A light twinge may appear, yet energy stays vibrant.",
      },
      {
        id: "o4",
        title: "Cervical mucus shifts",
        description: "Fluid becomes clear and stretchy to assist sperm travel.",
        mood: "Body awareness rises. Observe fertile signs.",
      },
      {
        id: "o5",
        title: "Increased libido",
        description: "Testosterone and estrogen together heighten desire and responsiveness.",
        mood: "Connection, play, and intimacy feel natural.",
      },
      {
        id: "o6",
        title: "Mittelschmerz",
        description: "A brief cramp can occur as fluid escapes the ruptured follicle.",
        mood: "Gentle stretches and hydration calm the sensation quickly.",
      },
    ],
  },
  {
    id: "luteal",
    title: "Luteal & Secretory",
    subtitle: "Stabilising the lining and preparing for a possible pregnancy",
    tone: {
      accent: "#6F5644",
    },
    steps: [
      {
        id: "l1",
        title: "Progesterone rises",
        description: "The corpus luteum releases progesterone to stabilise the lining.",
        mood: "Evenings feel cozy. Slow down and build routine.",
      },
      {
        id: "l2",
        title: "Lining thickens",
        description: "Nutrients accumulate to support an embryo if fertilisation occurs.",
        mood: "Body feels protective. Choose grounding movement.",
      },
      {
        id: "l3",
        title: "Body prepares",
        description: "Basal temperature stays slightly higher while waiting for a pregnancy signal.",
        mood: "Nesting instincts appear. Meal prep or organise spaces.",
      },
      {
        id: "l4",
        title: "PMS signals",
        description: "If no embryo implants, progesterone dips and PMS signs may surface.",
        mood: "Emotions heighten. Practise compassion and boundaries.",
      },
      {
        id: "l5",
        title: "Breast tenderness",
        description: "Hormonal shifts increase fluid in breast tissue.",
        mood: "Choose soft fabrics and warm showers for comfort.",
      },
      {
        id: "l6",
        title: "Bloating",
        description: "Water retention is common as progesterone fluctuates.",
        mood: "Light walks, leafy greens, and minerals reduce heaviness.",
      },
      {
        id: "l7",
        title: "Mood changes",
        description: "Falling progesterone can spark irritability or low mood.",
        mood: "Sleep, journaling, and gentle company ease the transition.",
      },
      {
        id: "l8",
        title: "Progesterone drops",
        description: "The corpus luteum dissolves and the cycle restarts with menstruation.",
        mood: "Reflect on the month and prepare for another reset.",
      },
    ],
  },
]

export const PhaseEducation: React.FC = () => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient colors={["#FFE5F1", "#FFF6FB"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <Text style={styles.title}>Menstrual Cycle Flow Chart</Text>
        <Text style={styles.subtitle}>
          Scroll through the complete cycle. Each phase pairs clinical context with how she may feel so a supporter can
          respond thoughtfully.
        </Text>
      </LinearGradient>

      <View style={styles.nodePill}>
        <Text style={styles.nodePillText}>Cycle Start</Text>
      </View>

      {PHASE_SECTIONS.map((section) => (
        <View key={section.id} style={styles.phasePanel}>
          <View style={styles.phaseHeadingRow}>
            <View style={[styles.headingAccent, { backgroundColor: hexToRgba(section.tone.accent, 0.45) }]} />
            <View style={styles.headingTextColumn}>
              <Text style={styles.phaseTitle}>{section.title}</Text>
              <Text style={styles.phaseSubtitle}>{section.subtitle}</Text>
            </View>
          </View>

          <View style={styles.timelineWrapper}>
            {section.steps.map((step, index) => {
              const isLast = index === section.steps.length - 1
              return (
                <View key={step.id} style={styles.timelineRow}>
                  <View style={styles.timelineColumn}>
                    <View
                      style={[
                        styles.timelineNode,
                        {
                          borderColor: section.tone.accent,
                          backgroundColor: hexToRgba(section.tone.accent, 0.85),
                        },
                      ]}
                    />
                    {!isLast ? <View style={styles.timelineConnector} /> : <View style={styles.timelineConnectorSpacer} />}
                  </View>

                  <View style={styles.stepCard}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDescription}>{step.description}</Text>
                    <Text style={[styles.stepMood, { color: section.tone.accent }]}>{step.mood}</Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      ))}

      <View style={styles.nodePill}>
        <Text style={styles.nodePillText}>Cycle End</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Applying the insight</Text>
        <Text style={styles.footerBody}>
          Use this timeline in caregiver briefings, health check-ins, or classroom sessions. Encourage mindful support by
          pairing data, empathy, and timely reminders.
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF5F9",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 56,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#FFD9EA",
    paddingHorizontal: 24,
    paddingVertical: 26,
    marginTop: 28,
    marginBottom: 20,
    shadowColor: "#F2A0C3",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    overflow: "hidden",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1B2737",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#566175",
    textAlign: "center",
  },
  nodePill: {
    alignSelf: "center",
    backgroundColor: "#F36FA0",
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 999,
    marginBottom: 22,
    shadowColor: "#C45B86",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  nodePillText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  phasePanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#F2D4E2",
    shadowColor: "#F2A0C3",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  phaseHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  headingAccent: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: 12,
    backgroundColor: "#F3B6CD",
  },
  headingTextColumn: {
    flex: 1,
  },
  phaseTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B2737",
    marginBottom: 4,
  },
  phaseSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5B6677",
  },
  timelineWrapper: {
    width: TIMELINE_WIDTH,
    alignSelf: "center",
  },
  timelineRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  timelineColumn: {
    width: 36,
    alignItems: "center",
  },
  timelineNode: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: "#F8DDE8",
  },
  timelineConnector: {
    flex: 1,
    width: 2,
    backgroundColor: "#F2CADB",
    marginTop: 4,
  },
  timelineConnectorSpacer: {
    flex: 1,
    width: 2,
  },
  stepCard: {
    flex: 1,
    backgroundColor: "#FFF9FD",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F2DCEA",
    shadowColor: "#F6C4DA",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E2432",
    marginBottom: 6,
  },
  stepDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: "#4A5668",
    marginBottom: 10,
  },
  stepMood: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
    color: "#C45B86",
  },
  footer: {
    marginTop: 30,
    paddingHorizontal: 10,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B2737",
    textAlign: "center",
    marginBottom: 8,
  },
  footerBody: {
    fontSize: 13,
    lineHeight: 19,
    color: "#615266",
    textAlign: "center",
  },
})







