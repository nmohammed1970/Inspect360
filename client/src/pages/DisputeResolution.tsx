import { useModules } from "@/hooks/use-modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert, Gavel, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";

export default function DisputeResolution() {
    const { isModuleEnabled, isLoading: isLoadingModules } = useModules();
    const isDisputeEnabled = isModuleEnabled("dispute_resolution");

    if (!isLoadingModules && !isDisputeEnabled) {
        return (
            <div className={cn("container mx-auto min-w-0 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4", pagePad)}>
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
                <Button variant="default" onClick={() => window.location.href = "/billing"}>
                    View Modules
                </Button>
            </div>
        );
    }

    return (
        <div className={cn("container mx-auto min-w-0 space-y-6", pagePad)}>
            <div className="flex flex-col gap-2 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold break-words">Dispute Resolution Portal</h1>
                <p className="text-muted-foreground break-words">Manage and resolve tenancy deposit disputes.</p>
            </div>

            <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg break-words">
                            <ShieldAlert className="w-5 h-5 text-orange-500 shrink-0" />
                            Open Disputes
                        </CardTitle>
                        <CardDescription className="break-words">Active cases requiring attention</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">0</div>
                    </CardContent>
                </Card>
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg break-words">
                            <Gavel className="w-5 h-5 text-blue-500 shrink-0" />
                            In Mediation
                        </CardTitle>
                        <CardDescription className="break-words">Cases currently in negotiation</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">0</div>
                    </CardContent>
                </Card>
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg break-words">
                            <Scale className="w-5 h-5 text-green-500 shrink-0" />
                            Resolved
                        </CardTitle>
                        <CardDescription className="break-words">Successfully closed cases</CardDescription>
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
