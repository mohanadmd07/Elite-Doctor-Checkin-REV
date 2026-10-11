import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EmptyState } from "../EmptyState";
import { TableSkeleton, CardGridSkeleton } from "../TableSkeleton";
import { ToastProvider, useToast } from "../Toast";
import { Search } from "lucide-react";

describe("UI Pattern Components", () => {
  describe("EmptyState", () => {
    it("renders title, description, and action button", () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          icon={Search}
          title="No Physicians Found"
          description="Try adjusting your filters"
          actionLabel="Clear Filters"
          onAction={handleAction}
        />
      );

      expect(screen.getByText("No Physicians Found")).toBeInTheDocument();
      expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
      
      const button = screen.getByRole("button", { name: "Clear Filters" });
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });

    it("renders without action button if not provided", () => {
      render(
        <EmptyState
          icon={Search}
          title="Empty View"
          description="Nothing here"
        />
      );

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("TableSkeleton & CardGridSkeleton", () => {
    it("renders the correct number of rows and columns", () => {
      const { container } = render(<TableSkeleton rows={3} cols={4} />);
      const rows = container.querySelectorAll("tr");
      expect(rows).toHaveLength(3);
      const cells = container.querySelectorAll("td");
      expect(cells).toHaveLength(12);
    });

    it("renders CardGridSkeleton properly", () => {
      const { container } = render(<CardGridSkeleton cards={2} />);
      expect(container.firstChild).toHaveClass("grid");
    });
  });

  describe("ToastProvider and useToast", () => {
    const TestConsumer = () => {
      const toast = useToast();
      return (
        <div>
          <button onClick={() => toast.success("Success Title", "Success details")}>
            Trigger Success
          </button>
        </div>
      );
    };

    it("displays and dismisses toast notifications", async () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Trigger Success"));
      expect(screen.getByText("Success Title")).toBeInTheDocument();
      expect(screen.getByText("Success details")).toBeInTheDocument();

      const dismissBtn = screen.getByLabelText("Dismiss notification");
      fireEvent.click(dismissBtn);
      await waitFor(() => {
        expect(screen.queryByText("Success Title")).not.toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });
});
