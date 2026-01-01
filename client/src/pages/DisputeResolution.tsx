import { useModules } from "@/hooks/use-modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert, Gavel, Scale } from "lucide-react";

export default function DisputeResolution() {
    const { isModuleEnabled, isLoading: isLoadingModules } = useModules();
    const isDisputeEnabled = isModuleEnabled("dispute_resolution");

    if (!isLoadingModules && !isDisputeEnabled) {
        return (
            <div className="container mx-auto p-4 md:p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <Scale className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold">Dispute Resolution Portal Required</h1>
                    <p className="text-muted-foreground max-w-md">
                        The Dispute Resolution Portal is not enabled for your organization.
                        <br />
                        Resolve deposit disputes efficiently with this premium module.
                    </p>
                </div>
                <Button variant="default" onClick={() => window.location.href = "/marketplace"}>
                    Go to Marketplace
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold">Dispute Resolution Portal</h1>
                <p className="text-muted-foreground">Manage and resolve tenancy deposit disputes.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-orange-500" />
                            Open Disputes
                        </CardTitle>
                        <CardDescription>Active cases requiring attention</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">0</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gavel className="w-5 h-5 text-blue-500" />
                            In Mediation
                        </CardTitle>
                        <CardDescription>Cases currently in negotiation</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">0</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Scale className="w-5 h-5 text-green-500" />
                            Resolved
                        </CardTitle>
                        <CardDescription>Successfully closed cases</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">0</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="min-h-[300px] flex items-center justify-center border-dashed">
                <div className="text-center space-y-2">
                    <Gavel className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
                    <h3 className="text-lg font-medium">No disputes found</h3>
                    <p className="text-sm text-muted-foreground">No active dispute cases for this organization.</p>
                </div>
            </Card>
        </div>
    );
}
