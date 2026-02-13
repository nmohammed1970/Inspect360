import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function CustomCaption(props: { displayMonth: Date; goToMonth: (month: Date) => void }) {
  const { displayMonth, goToMonth } = props
  const [showYearPicker, setShowYearPicker] = React.useState(false)
  const yearListRef = React.useRef<HTMLDivElement>(null)
  const yearPickerRef = React.useRef<HTMLDivElement>(null)
  const currentYear = displayMonth.getFullYear()
  const currentMonth = displayMonth.getMonth()
  
  // Generate years (100 years range: 50 years back and 50 years forward from current year)
  const currentYearValue = new Date().getFullYear()
  const years = Array.from({ length: 101 }, (_, i) => currentYearValue - 50 + i)
  
  // Scroll to current year when year picker opens
  React.useEffect(() => {
    if (showYearPicker && yearListRef.current) {
      const currentYearIndex = years.indexOf(currentYear)
      const yearElement = yearListRef.current.children[currentYearIndex] as HTMLElement
      if (yearElement) {
        yearElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [showYearPicker, currentYear, years])

  // Close year picker when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (yearPickerRef.current && !yearPickerRef.current.contains(event.target as Node)) {
        setShowYearPicker(false)
      }
    }

    if (showYearPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showYearPicker])

  const handleYearSelect = (year: number) => {
    goToMonth(new Date(year, currentMonth, 1))
    setShowYearPicker(false)
  }

  return (
    <div className="flex justify-center pt-1 relative items-center">
      <button
        type="button"
        onClick={() => goToMonth(new Date(currentYear, currentMonth - 1, 1))}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      
      <div className="relative">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">
            {format(displayMonth, "MMMM")}
          </span>
          <button
            type="button"
            onClick={() => setShowYearPicker(!showYearPicker)}
            className="text-sm font-medium hover:bg-accent hover:text-accent-foreground px-2 py-1 rounded-md transition-colors cursor-pointer"
          >
            {currentYear}
          </button>
        </div>
        
        {showYearPicker && (
          <div 
            ref={yearPickerRef}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-popover border rounded-md shadow-lg z-50 w-20 max-h-48 overflow-y-auto"
          >
            <div
              ref={yearListRef}
              className="p-2 space-y-0"
              onWheel={(e) => {
                e.stopPropagation()
              }}
            >
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleYearSelect(year)}
                  className={cn(
                    "w-full text-center py-1.5 px-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors",
                    year === currentYear && "bg-primary text-primary-foreground font-semibold"
                  )}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <button
        type="button"
        onClick={() => goToMonth(new Date(currentYear, currentMonth + 1, 1))}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  month,
  onMonthChange,
  ...props
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState<Date | undefined>(
    month || new Date()
  )

  const currentMonth = month || internalMonth || new Date()

  const handleMonthChange = (newMonth: Date) => {
    setInternalMonth(newMonth)
    onMonthChange?.(newMonth)
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      month={currentMonth}
      onMonthChange={handleMonthChange}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "hidden",
        nav: "hidden",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Caption: (captionProps) => (
          <CustomCaption {...captionProps} goToMonth={handleMonthChange} />
        ),
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
