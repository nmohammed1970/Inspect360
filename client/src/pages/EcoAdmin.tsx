import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, FileText } from "lucide-react";
import {
  ExtensiveInspectionManagement,
  QuotationsManagement,
} from "./EcoAdminComponents";

/** Legacy tabbed eco-admin shell (unused in routed portal; kept for reference). */
export default function EcoAdmin() {
  const [activeTab, setActiveTab] = useState("extensive");

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-title">Eco Admin Dashboard</h1>
        <p className="text-muted-foreground" data-testid="text-subtitle">
          Manage modules, extensive inspection types, and quotations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="extensive" data-testid="tab-extensive">
            <Info className="h-4 w-4 mr-2" />
            Extensive
          </TabsTrigger>
          <TabsTrigger value="quotations" data-testid="tab-quotations">
            <FileText className="h-4 w-4 mr-2" />
            Quotations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="extensive" className="mt-6">
          <ExtensiveInspectionManagement />
        </TabsContent>

        <TabsContent value="quotations" className="mt-6">
          <QuotationsManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
