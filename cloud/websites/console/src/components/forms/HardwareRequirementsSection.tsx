import { Cpu } from "lucide-react";
import HardwareRequirementsForm from "./HardwareRequirementsForm";
import { HardwareRequirement } from "@mentra/sdk";
import { ExternalLinkIcon } from "@/components/ui/icons";

interface HardwareRequirementsSectionProps {
  requirements: HardwareRequirement[];
  onChange: (requirements: HardwareRequirement[]) => void;
}

export function HardwareRequirementsSection({ requirements, onChange }: HardwareRequirementsSectionProps) {
  return (
    <div className="border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-base font-medium flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Minimum Hardware Requirements
        </h4>
        <a
          href="https://docs.mentraglass.com/app-devs/core-concepts/hardware-capabilities/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-link hover:text-link-hover hover:underline flex items-center gap-1"
        >
          Learn about hardware requirements
          <ExternalLinkIcon />
        </a>
      </div>
      <HardwareRequirementsForm requirements={requirements} onChange={onChange} />
    </div>
  );
}

export default HardwareRequirementsSection;
