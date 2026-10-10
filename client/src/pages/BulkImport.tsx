import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { pagePad, textBreak, textTruncate } from "@/lib/responsive";
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Users, 
  Building2, 
  Boxes, 
  Package,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2
} from "lucide-react";

type EntityType = "tenants" | "properties" | "blocks" | "assets";

interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorCount: number;
  errors: { row: number; column: string; message: string }[];
  preview: { rowNum: number; data: any }[];
}

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
}

const entityConfig: Record<EntityType, { title: string; description: string; icon: any }> = {
  tenants: {
    title: "Tenants",
    description: "Import tenant details including contact information and lease assignments",
    icon: Users,
  },
  properties: {
    title: "Properties",
    description: "Import property units with addresses and block assignments",
    icon: Building2,
  },
  blocks: {
    title: "Blocks",
    description: "Import building blocks for organizing properties",
    icon: Boxes,
  },
  assets: {
    title: "Assets",
    description: "Import asset inventory for properties",
    icon: Package,
  },
};

function ImportTab({ entity }: { entity: EntityType }) {
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();
  const config = entityConfig[entity];

  const validateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/imports/${entity}/validate`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Validation failed");
      }
      return response.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setValidation(data);
      if (data.errorCount === 0) {
        toast({
          title: "Validation Successful",
          description: `${data.validRows} rows ready to import`,
        });
      } else {
        toast({
          title: "Validation Complete",
          description: `${data.validRows} valid rows, ${data.errorCount} errors found`,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Validation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/imports/${entity}/commit`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Import failed");
      }
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setValidation(null);
      setFile(null);
      if (data.failed === 0) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${data.imported} records`,
        });
      } else {
        toast({
          title: "Import Completed with Errors",
          description: `Imported ${data.imported}, failed ${data.failed}`,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidation(null);
      setImportResult(null);
    }
  }, []);

  const handleValidate = useCallback(() => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    validateMutation.mutate(formData);
  }, [file, validateMutation]);

  const handleCommit = useCallback(() => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    commitMutation.mutate(formData);
  }, [file, commitMutation]);

  const handleDownloadTemplate = useCallback(() => {
    window.location.href = `/api/imports/templates/${entity}`;
  }, [entity]);

  const handleReset = useCallback(() => {
    setFile(null);
    setValidation(null);
    setImportResult(null);
  }, []);

  const Icon = config.icon;

  return (
    <div className="space-y-6 min-w-0">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className={textBreak}>{config.title} Import</CardTitle>
              <CardDescription className={textBreak}>{config.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
            <Button 
              variant="outline" 
              className="min-h-11 w-full sm:w-auto shrink-0"
              onClick={handleDownloadTemplate}
              data-testid={`button-download-template-${entity}`}
            >
              <Download className="h-4 w-4 mr-2 shrink-0" />
              Download Template
            </Button>
            
            <div className="flex-1 w-full min-w-0">
              <label 
                htmlFor={`file-${entity}`}
                className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover-elevate transition-colors min-h-11 min-w-0"
              >
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className={`text-sm text-muted-foreground ${textTruncate}`}>
                  {file ? file.name : "Choose Excel file (.xlsx)"}
                </span>
              </label>
              <input
                id={`file-${entity}`}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                data-testid={`input-file-${entity}`}
              />
            </div>
          </div>

          {file && !validation && !importResult && (
            <div className="flex flex-wrap items-center gap-4">
              <Button 
                onClick={handleValidate}
                disabled={validateMutation.isPending}
                data-testid={`button-validate-${entity}`}
              >
                {validateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Validate File
              </Button>
              <Button variant="ghost" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          )}

          {validateMutation.isPending && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Validating file...</p>
              <Progress value={50} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Validation Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{validation.totalRows} Total Rows</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {validation.validRows} Valid
                </Badge>
              </div>
              {validation.errorCount > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    {validation.errorCount} Errors
                  </Badge>
                </div>
              )}
            </div>

            {validation.errors.length > 0 && (
              <div className="space-y-2 min-w-0">
                <h4 className="font-medium text-sm">Errors:</h4>
                <div className="max-h-48 overflow-x-auto overflow-y-auto border rounded-lg">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Row</th>
                        <th className="text-left p-2">Column</th>
                        <th className="text-left p-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.errors.map((error, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 whitespace-nowrap">{error.row}</td>
                          <td className={`p-2 ${textBreak}`}>{error.column}</td>
                          <td className={`p-2 text-destructive ${textBreak}`}>{error.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validation.preview.length > 0 && (
              <div className="space-y-2 min-w-0">
                <h4 className="font-medium text-sm">Preview (first {validation.preview.length} valid rows):</h4>
                <div className="max-h-48 overflow-x-auto overflow-y-auto border rounded-lg">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Row</th>
                        <th className="text-left p-2">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.preview.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 whitespace-nowrap">{item.rowNum}</td>
                          <td className="p-2">
                            <code className={`text-xs bg-muted px-1 py-0.5 rounded block ${textBreak}`}>
                              {JSON.stringify(item.data).slice(0, 100)}...
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-4 pt-4">
              {validation.validRows > 0 && (
                <Button 
                  onClick={handleCommit}
                  disabled={commitMutation.isPending}
                  data-testid={`button-commit-${entity}`}
                >
                  {commitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Import {validation.validRows} Records
                </Button>
              )}
              <Button variant="outline" onClick={handleReset}>
                Start Over
              </Button>
            </div>

            {commitMutation.isPending && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Importing records...</p>
                <Progress value={75} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.failed === 0 ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <Badge variant="success">
                <CheckCircle className="h-3 w-3 mr-1" />
                {importResult.imported} Imported
              </Badge>
              {importResult.failed > 0 && (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  {importResult.failed} Failed
                </Badge>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Failed Records:</h4>
                <div className="max-h-48 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Row</th>
                        <th className="text-left p-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.errors.map((error, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{error.row}</td>
                          <td className="p-2 text-destructive">{error.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button variant="outline" onClick={handleReset}>
              Import More
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BulkImport() {
  return (
    <div className={`${pagePad} space-y-6 min-w-0`}>
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold break-words" data-testid="text-page-title">
          Bulk Import
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Import data from Excel spreadsheets
        </p>
      </div>

      <Tabs defaultValue="blocks" className="space-y-6 min-w-0">
        <TabsList className="flex h-auto min-h-11 w-full max-w-full justify-start overflow-x-auto flex-nowrap sm:grid sm:max-w-lg sm:grid-cols-4 sm:overflow-visible">
          <TabsTrigger value="blocks" data-testid="tab-blocks" className="min-h-11 shrink-0 gap-2">
            <Boxes className="h-4 w-4 shrink-0" />
            Blocks
          </TabsTrigger>
          <TabsTrigger value="properties" data-testid="tab-properties" className="min-h-11 shrink-0 gap-2">
            <Building2 className="h-4 w-4 shrink-0" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="tenants" data-testid="tab-tenants" className="min-h-11 shrink-0 gap-2">
            <Users className="h-4 w-4 shrink-0" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets" className="min-h-11 shrink-0 gap-2">
            <Package className="h-4 w-4 shrink-0" />
            Assets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blocks">
          <ImportTab entity="blocks" />
        </TabsContent>
        <TabsContent value="properties">
          <ImportTab entity="properties" />
        </TabsContent>
        <TabsContent value="tenants">
          <ImportTab entity="tenants" />
        </TabsContent>
        <TabsContent value="assets">
          <ImportTab entity="assets" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
