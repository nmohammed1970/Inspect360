import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Clock, Circle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface ComplianceDocument {
  id: string;
  documentType: string;
  expiryDate: string | null;
  documentUrl: string;
  createdAt: string;
}

interface ComplianceDocumentCalendarProps {
  entityType?: 'property' | 'block';
  entityId?: string;
  // Optional: for aggregate views like Compliance page where documents are filtered externally
  documents?: ComplianceDocument[];
  isLoading?: boolean;
}

type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';

interface DocumentTypeData {
  documentType: string;
  monthData: MonthData[];
  status: DocumentStatus;
  expiryDate: string | null;
}

interface MonthData {
  month: string;
  status: DocumentStatus;
  hasDocument: boolean;
}

function getDocumentStatus(expiryDate: string | null): DocumentStatus {
  if (!expiryDate) return 'no_expiry';
  
  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring_soon';
  return 'valid';
}

interface StatusCellProps {
  data: MonthData;
}

function StatusCell({ data, onNavigate }: StatusCellProps) {
  const getStatusIcon = () => {
    if (!data.hasDocument) {
      return <Circle className="h-4 w-4 text-muted-foreground/30" />;
    }
    
    switch (data.status) {
      case 'valid':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'expired':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'expiring_soon':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'no_expiry':
        return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/30" />;
    }
  };

  const getStatusColor = () => {
    if (!data.hasDocument) {
      return 'bg-muted/30 border-border/30';
    }
    
    switch (data.status) {
      case 'valid':
        return 'bg-green-100 dark:bg-green-950 border-green-300 dark:border-green-800';
      case 'expired':
        return 'bg-destructive/10 border-destructive/30';
      case 'expiring_soon':
        return 'bg-yellow-100 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-800';
      case 'no_expiry':
        return 'bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-800';
      default:
        return 'bg-muted/30 border-border/30';
    }
  };

  const statusText = !data.hasDocument ? 'Missing' : data.status.replace('_', ' ');
  const title = `${data.month}: ${statusText}`;

  return (
    <div 
      className={`flex items-center justify-center p-2 rounded-md border ${getStatusColor()} transition-all`}
      title={title}
    >
      {getStatusIcon()}
    </div>
  );
}

export default function ComplianceDocumentCalendar({ entityType, entityId, documents: externalDocs, isLoading: externalLoading }: ComplianceDocumentCalendarProps) {
  const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Determine if we should fetch data internally or use external data
  const useExternalData = externalDocs !== undefined;

  // Fetch compliance documents for the entity (only when not using external data)
  const { data: internalDocs = [], isLoading: internalLoading } = useQuery<ComplianceDocument[]>({
    queryKey: [`/api/${entityType === 'property' ? 'properties' : 'blocks'}`, entityId, 'compliance'],
    queryFn: async () => {
      const endpoint = entityType === 'property' 
        ? `/api/properties/${entityId}/compliance`
        : `/api/blocks/${entityId}/compliance`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entityId && !useExternalData,
  });

  // Use external data if provided, otherwise use internal data
  const documents = useExternalData ? externalDocs : internalDocs;
  const isLoading = useExternalData ? (externalLoading ?? false) : internalLoading;

  const yearNavigator = (
    <div className="flex items-center gap-1">
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6"
        onClick={() => setSelectedYear(y => y - 1)}
        data-testid="button-doc-prev-year"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="font-medium min-w-[4rem] text-center" data-testid="text-doc-selected-year">{selectedYear}</span>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6"
        onClick={() => setSelectedYear(y => y + 1)}
        data-testid="button-doc-next-year"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  const DEFAULT_DOCUMENT_TYPES = [
    "Fire Safety Certificate",
    "Building Insurance",
    "Electrical Safety Certificate",
    "Gas Safety Certificate",
    "EPC Certificate",
    "HMO License",
    "Planning Permission",
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annual Compliance Documents</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {yearNavigator}
            <span className="text-muted-foreground">· Loading compliance documents...</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const documentsByType = documents.reduce((acc, doc) => {
    if (!acc[doc.documentType]) {
      acc[doc.documentType] = [];
    }
    acc[doc.documentType].push(doc);
    return acc;
  }, {} as Record<string, ComplianceDocument[]>);

  const allDocumentTypes = Array.from(new Set([...DEFAULT_DOCUMENT_TYPES, ...Object.keys(documentsByType)]));

  const documentTypeData: DocumentTypeData[] = allDocumentTypes.map((docType) => {
    const docs = documentsByType[docType];
    
    if (!docs || docs.length === 0) {
      const monthData: MonthData[] = monthAbbreviations.map((month) => ({
        month,
        status: 'no_expiry' as DocumentStatus,
        hasDocument: false,
      }));
      
      return {
        documentType: docType,
        monthData,
        status: 'no_expiry' as DocumentStatus,
        expiryDate: null,
      };
    }
    
    const latestDoc = docs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    
    const status = getDocumentStatus(latestDoc.expiryDate);
    const expiryMonth = latestDoc.expiryDate ? new Date(latestDoc.expiryDate).getMonth() : null;
    const expiryYear = latestDoc.expiryDate ? new Date(latestDoc.expiryDate).getFullYear() : null;
    
    const monthData: MonthData[] = monthAbbreviations.map((month, idx) => {
      const isExpiryMonth = expiryYear === selectedYear && expiryMonth === idx;
      // For past years, all months are "past". For future years, no months are "past".
      // For current year, use actual current month.
      const effectiveCurrentMonth = selectedYear < currentYear ? 12 : (selectedYear > currentYear ? -1 : currentMonth);
      const isPastMonth = idx < effectiveCurrentMonth && expiryYear === selectedYear;
      const hasDocument = latestDoc.expiryDate 
        ? (expiryYear && expiryYear > selectedYear) || (expiryYear === selectedYear && idx <= (expiryMonth ?? 11))
        : true;
      
      let monthStatus: DocumentStatus = 'no_expiry';
      if (latestDoc.expiryDate) {
        if (isExpiryMonth) {
          monthStatus = status;
        } else if (hasDocument && status !== 'expired') {
          monthStatus = 'valid';
        } else if (status === 'expired' && isPastMonth) {
          monthStatus = 'expired';
        } else if (!hasDocument) {
          monthStatus = 'expired';
        }
      }
      
      return {
        month,
        status: monthStatus,
        hasDocument: hasDocument || !latestDoc.expiryDate,
      };
    });
    
    return {
      documentType: docType,
      monthData,
      status,
      expiryDate: latestDoc.expiryDate,
    };
  });

  const docTypesWithDocs = documentTypeData.filter(d => d.expiryDate !== null || documentsByType[d.documentType]?.length > 0);
  const validCount = docTypesWithDocs.filter(d => d.status === 'valid' || d.status === 'no_expiry').length;
  const expiringCount = docTypesWithDocs.filter(d => d.status === 'expiring_soon').length;
  const expiredCount = docTypesWithDocs.filter(d => d.status === 'expired').length;
  const missingCount = documentTypeData.filter(d => !documentsByType[d.documentType]?.length).length;
  const overallCompliance = documents.length > 0 
    ? Math.round((validCount / docTypesWithDocs.length) * 100) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Annual Compliance Documents
              <Badge variant="outline" className="ml-2" data-testid="badge-compliance-overall">
                {overallCompliance}% Compliant
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
              {yearNavigator}
              <span className="text-muted-foreground">·</span>
              <span>{documents.length} document(s) uploaded · {missingCount} type(s) missing</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-muted-foreground">Valid ({validCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-muted-foreground">Expired ({expiredCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span className="text-muted-foreground">Expiring Soon ({expiringCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-muted-foreground/30" />
            <span className="text-muted-foreground">Missing ({missingCount})</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: '200px repeat(12, 1fr) 100px' }}>
              <div className="font-semibold text-sm p-2">Document Type</div>
              {monthAbbreviations.map((month) => (
                <div key={month} className="font-semibold text-sm text-center p-2">
                  {month}
                </div>
              ))}
              <div className="font-semibold text-sm text-center p-2">Status</div>
            </div>

            {documentTypeData.map((docType) => {
              const hasDocs = documentsByType[docType.documentType]?.length > 0;
              return (
                <div 
                  key={docType.documentType} 
                  className="grid gap-2 mb-2 items-center"
                  style={{ gridTemplateColumns: '200px repeat(12, 1fr) 100px' }}
                >
                  <div className="text-sm font-medium p-2 truncate" title={docType.documentType}>
                    {docType.documentType}
                  </div>

                  {docType.monthData.map((monthData) => (
                    <StatusCell 
                      key={monthData.month} 
                      data={monthData}
                    />
                  ))}

                  <div className="text-center p-2">
                    <Badge 
                      variant={
                        !hasDocs ? 'outline' :
                        docType.status === 'valid' || docType.status === 'no_expiry' ? 'default' :
                        docType.status === 'expiring_soon' ? 'secondary' :
                        'destructive'
                      }
                      className={`${!hasDocs ? 'text-muted-foreground' : (docType.status === 'valid' || docType.status === 'no_expiry' ? 'bg-green-600' : '')} min-w-[100px] inline-flex justify-center`}
                    >
                      {!hasDocs ? 'Missing' : (docType.status === 'no_expiry' ? 'Valid' : docType.status.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '))}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 pt-6 border-t mt-6">
          <div>
            <div className="text-sm text-muted-foreground">Total Documents</div>
            <div className="text-2xl font-bold">{documents.length}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Valid</div>
            <div className="text-2xl font-bold text-green-600">{validCount}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Missing</div>
            <div className="text-2xl font-bold text-muted-foreground">{missingCount}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Attention Needed</div>
            <div className="text-2xl font-bold text-destructive">{expiringCount + expiredCount}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
