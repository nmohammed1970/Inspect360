import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Minus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";

export default function Credits() {
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = useLocale();
  const [selectedCredits, setSelectedCredits] = useState(10);

  const { data: transactions = [] } = useQuery({
    queryKey: ["/api/credits/transactions"],
  });

  const checkout = useMutation({
    mutationFn: async (credits: number) => {
      return await apiRequest("/api/stripe/create-checkout", "POST", { credits });
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create checkout session",
        variant: "destructive",
      });
    },
  });

  const creditOptions = [
    { amount: 10, price: 10, popular: false },
    { amount: 50, price: 45, popular: true, discount: "10% off" },
    { amount: 100, price: 80, popular: false, discount: "20% off" },
  ];

  const creditsRemaining = user?.organization?.creditsRemaining || 0;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Inspection Credits</h1>
        <p className="text-muted-foreground">Manage your AI analysis credits</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Current Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary" data-testid="text-credits-balance">
            {creditsRemaining} credits
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Each credit allows for one AI photo analysis or comparison
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Purchase Credits</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {creditOptions.map((option) => (
            <Card
              key={option.amount}
              className={`relative ${
                option.popular ? "border-accent border-2" : ""
              }`}
            >
              {option.popular && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-accent">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-center">
                  {option.amount} Credits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">{locale.formatCurrency(option.price, false)}</div>
                  {option.discount && (
                    <Badge variant="secondary" className="mt-2">
                      {option.discount}
                    </Badge>
                  )}
                </div>
                <Button
                  className="w-full bg-primary"
                  onClick={() => checkout.mutate(option.amount)}
                  disabled={checkout.isPending}
                  data-testid={`button-purchase-${option.amount}`}
                >
                  Purchase
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-muted-foreground">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction: any) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="flex items-center gap-3">
                    {transaction.amount > 0 ? (
                      <Plus className="w-4 h-4 text-accent" />
                    ) : (
                      <Minus className="w-4 h-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`font-semibold ${
                      transaction.amount > 0 ? "text-accent" : "text-muted-foreground"
                    }`}
                  >
                    {transaction.amount > 0 ? "+" : ""}
                    {transaction.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
