import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useDeliveryStore, type DeliveryAssignment, type AssignmentStatus } from "@/lib/stores/delivery";

interface Step {
  status: AssignmentStatus;
  label: string;
  action?: string;
  nextStatus?: AssignmentStatus;
}

const STEPS: Step[] = [
  { status: "accepted", label: "Accepted", action: "Mark picked up", nextStatus: "picked_up" },
  { status: "picked_up", label: "Picked up", action: "Mark delivered", nextStatus: "delivered" },
  { status: "delivered", label: "Delivered" },
];

interface DeliveryStepsProps {
  assignment: DeliveryAssignment;
}

export function DeliverySteps({ assignment }: DeliveryStepsProps) {
  const markPickedUp = useDeliveryStore((s) => s.markPickedUp);
  const markDelivered = useDeliveryStore((s) => s.markDelivered);
  const [loading, setLoading] = useState(false);

  const currentStepIndex = STEPS.findIndex((s) => s.status === assignment.status);
  const currentStep = STEPS[currentStepIndex];

  async function handleAction() {
    if (!currentStep?.nextStatus) return;
    setLoading(true);
    if (currentStep.nextStatus === "picked_up") {
      await markPickedUp(assignment.id);
    } else if (currentStep.nextStatus === "delivered") {
      await markDelivered(assignment.id);
    }
    setLoading(false);
  }

  return (
    <View className="bg-white/5 border border-white/10 rounded-card p-4">
      {/* Step progress */}
      <View className="flex-row items-center mb-5">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStepIndex;
          const isActive = i === currentStepIndex;
          return (
            <View key={step.status} className="flex-row items-center flex-1">
              <View className="items-center">
                <View
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: isCompleted
                      ? "#2D6A4F"
                      : isActive
                      ? "#FF6B35"
                      : "rgba(255,255,255,0.1)",
                  }}
                >
                  <Text className="text-white text-xs font-bold">
                    {isCompleted ? "✓" : i + 1}
                  </Text>
                </View>
                <Text
                  className="text-xs mt-1 text-center"
                  style={{
                    color: isActive ? "#FF6B35" : isCompleted ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)",
                    fontWeight: isActive ? "700" : "400",
                  }}
                >
                  {step.label}
                </Text>
              </View>
              {i < STEPS.length - 1 && (
                <View
                  className="flex-1 h-0.5 mx-2 mb-5"
                  style={{
                    backgroundColor: isCompleted ? "#2D6A4F" : "rgba(255,255,255,0.1)",
                  }}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* CTA */}
      {currentStep?.action && (
        <TouchableOpacity
          className="bg-[#FF6B35] rounded-btn py-4 items-center"
          onPress={handleAction}
          disabled={loading}
          style={{ opacity: loading ? 0.7 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">
              {currentStep.action}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}
